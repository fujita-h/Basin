
#include <iostream>
#include <thread>
#include <unistd.h>
#include <redis-cpp/stream.h>
#include <redis-cpp/execute.h>
#include "cmdline.h"
#include "parser.hpp"

using std::cout;
using std::endl;
using std::string;
using namespace Tins;

static void redis_execute_xadd_no_flush(std::shared_ptr<std::iostream> stream_p, std::string key, std::shared_ptr<Parser::datagram_t> value_p);

int main(int argc, char *argv[])
{
    // setup cmdline parser
    cmdline::parser cmdline_parser;
    cmdline_parser.add<string>("pcap-interface", 'i', "capture interface name", true, "");
    cmdline_parser.add<string>("pcap-filter", 'f', "capture filter", false, "");
    cmdline_parser.add<int>("pcap-buffer-size", '\0', "pcap buffer size [MB]", false, 64, cmdline::range(0, 1024));
    cmdline_parser.add<int>("pcap-timeout", '\0', "pcap timeout [ms]", false, 50, cmdline::range(0, 10000));
    cmdline_parser.add<int>("pcap-snap-length", '\0', "pcap snap length [byte]", false, 65535, cmdline::range(0, 65535));
    cmdline_parser.add<string>("pcap-promiscuous-mode", '\0', "promiscuous mode", false, "true", cmdline::oneof<string>("true", "false"));
    cmdline_parser.add<string>("pcap-immediate-mode", '\0', "immediate mode", false, "false", cmdline::oneof<string>("true", "false"));
    cmdline_parser.add("pcap-from-file", '\0', "use pcap file instead of interface");

    cmdline_parser.add<string>("redis-hostname", '\0', "redis-server hostname", false, "127.0.0.1");
    cmdline_parser.add<string>("redis-port", '\0', "redis-server port number", false, "6379");
    cmdline_parser.add<string>("redis-database-number", '\0', "redis-server port number", false, "0");

    cmdline_parser.add<string>("divide-streams", '\0', "divide stream type", false, "ip", cmdline::oneof<string>("none", "mac", "ip"));
    cmdline_parser.add<int>("stream-max-length", '\0', "stream max length", false, 10000, cmdline::range(0, std::numeric_limits<int>::max()));
    cmdline_parser.add<string>("stream-prefix", '\0', "stream prefix", false, "stream/");
    cmdline_parser.add<string>("default-stream", '\0', "default stream name", false, "default");
    cmdline_parser.add<string>("payload-convert-method", '\0', "peyload convert method. base64 or hex", false, "base64", cmdline::oneof<string>("base64", "hex"));

    // print usage and exit, if mandatory args not set.
    cmdline_parser.parse_check(argc, argv);

    // create Tins SnifferConfiguration
    SnifferConfiguration sniffer_config;
    sniffer_config.set_immediate_mode(cmdline_parser.get<string>("pcap-immediate-mode") == "true" ? true : false);
    sniffer_config.set_timeout(cmdline_parser.get<int>("pcap-timeout"));
    sniffer_config.set_snap_len(cmdline_parser.get<int>("pcap-snap-length"));
    sniffer_config.set_buffer_size(cmdline_parser.get<int>("pcap-buffer-size") * 1024 * 1024);
    sniffer_config.set_promisc_mode(cmdline_parser.get<string>("pcap-promiscuous-mode") == "true" ? true : false);
    sniffer_config.set_filter(cmdline_parser.get<string>("pcap-filter"));

    // create Redis Instance
    //Redis::config_t redis_config;
    //redis_config.hostname = cmdline_parser.get<string>("redis-hostname");
    //redis_config.port = cmdline_parser.get<string>("redis-port");
    //Redis redis(redis_config);

    static SafeQueue<Parser::datagram_t> safe_queue;

    // create parser instance
    Parser::config_t parser_config;
    parser_config.payload_convert_method = cmdline_parser.get<string>("payload-convert-method");

    //parser_config.divide_stream = cmdline_parser.get<string>("divide-streams");
    //parser_config.stream_prefix = cmdline_parser.get<string>("stream-prefix");
    //parser_config.default_stream = cmdline_parser.get<string>("default-stream");

    Parser parser(parser_config, &safe_queue);

    std::thread t1([&] {
        if (cmdline_parser.exist("pcap-from-file"))
        {
            FileSniffer sniffer(cmdline_parser.get<string>("pcap-interface"), sniffer_config);
            sniffer.sniff_loop(parser.parse);
        }
        else
        {

            try
            {
                // create sniffer instance
                Sniffer sniffer(cmdline_parser.get<string>("pcap-interface"), sniffer_config);
                // start sniffer
                sniffer.sniff_loop(parser.parse);
            }
            catch (Tins::pcap_error pe)
            {
                std::cout << "pcap_error: " << pe.what() << std::endl;
                exit(-1);
            }
        }
    });

    std::thread t2([&] {
        while (true)
        {
            if (safe_queue.size() > 0)
            {
                auto stream = rediscpp::make_stream(cmdline_parser.get<string>("redis-hostname"),
                                                    cmdline_parser.get<string>("redis-port"));

                rediscpp::execute_no_flush(*stream, "SELECT", cmdline_parser.get<string>("redis-database-number"));
                size_t cnt = 1;


                while (!safe_queue.empty())
                {
                    try
                    {
                        auto value = safe_queue.pop();

                        if (cmdline_parser.get<string>("divide-streams") == "mac")
                        {
                            if (value->layer_2_src_addr == "" || value->layer_2_dst_addr == "")
                            {
                                redis_execute_xadd_no_flush(stream, cmdline_parser.get<string>("stream-prefix") + cmdline_parser.get<string>("default-stream"), value);
                                cnt++;
                            }
                            if (value->layer_2_src_addr != "")
                            {
                                redis_execute_xadd_no_flush(stream, cmdline_parser.get<string>("stream-prefix") + value->layer_2_src_addr, value);
                                cnt++;
                            }
                            if (value->layer_2_dst_addr != "")
                            {
                                redis_execute_xadd_no_flush(stream, cmdline_parser.get<string>("stream-prefix") + value->layer_2_dst_addr, value);
                                cnt++;
                            }
                        }
                        else if (cmdline_parser.get<string>("divide-streams") == "ip")
                        {
                            if (value->layer_3_src_addr == "" || value->layer_3_dst_addr == "")
                            {
                                redis_execute_xadd_no_flush(stream, cmdline_parser.get<string>("stream-prefix") + cmdline_parser.get<string>("default-stream"), value);
                                cnt++;
                            }
                            if (value->layer_3_src_addr != "")
                            {
                                redis_execute_xadd_no_flush(stream, cmdline_parser.get<string>("stream-prefix") + value->layer_3_src_addr, value);
                                cnt++;
                            }
                            if (value->layer_3_dst_addr != "")
                            {
                                redis_execute_xadd_no_flush(stream, cmdline_parser.get<string>("stream-prefix") + value->layer_3_dst_addr, value);
                                cnt++;
                            }
                        }
                        else
                        {
                            redis_execute_xadd_no_flush(stream, cmdline_parser.get<string>("stream-prefix") + cmdline_parser.get<string>("default-stream"), value);
                            cnt++;
                        }
                    }
                    catch (EmptyQueue &e)
                    {
                        continue;
                    }
                }
                if (cmdline_parser.get<int>("stream-max-length") > 0)
                {
                    rediscpp::execute_no_flush(*stream, "XTRIM", "test-stream", "MAXLEN", "~", std::to_string(cmdline_parser.get<int>("stream-max-length")));
                    cnt++;
                }

                std::flush(*stream);

                for (size_t i = 0; i < cnt; i++)
                {
                    try
                    {
                        rediscpp::value value{*stream};
                        if (value.is_error_message())
                        {
                            std::cout << "Redis: Error:";
                            if (value.is_string())
                            {
                                std::cout << value.as_string() << std::endl;
                            }
                            else
                            {
                                std::cout << std::endl;
                            }
                        }
                    }
                    catch (std::runtime_error &e)
                    {
                        std::cout << "Redis error: " << e.what() << std::endl;
                    }
                }
            }

            usleep(5000);
        }
    });

    t1.join();
    t2.join();

    return 0;
}

static void redis_execute_xadd_no_flush(std::shared_ptr<std::iostream> stream_p, std::string key, std::shared_ptr<Parser::datagram_t> value_p)
{
    rediscpp::execute_no_flush(*stream_p, "XADD", key, "*",
                               "layer_2_type", value_p->layer_2_type,
                               "layer_2_src_addr", value_p->layer_2_src_addr,
                               "layer_2_dst_addr", value_p->layer_2_dst_addr,
                               "layer_3_type", value_p->layer_3_type,
                               "layer_3_src_addr", value_p->layer_3_src_addr,
                               "layer_3_dst_addr", value_p->layer_3_dst_addr,
                               "layer_4_type", value_p->layer_4_type,
                               "layer_4_src_port", value_p->layer_4_src_port,
                               "layer_4_dst_port", value_p->layer_4_dst_port,
                               "payload_type", value_p->payload_type,
                               "payload_size", value_p->payload_size,
                               "payload_encoding_type", value_p->payload_encoding_type,
                               "payload_payload", value_p->payload);
};
