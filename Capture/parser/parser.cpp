#include "parser.hpp"
#include <iomanip>
#include <sstream>
#include <queue>
#include <tins/tins.h>

Parser *Parser::thisPtr;

Parser::Parser(config_t &c, SafeQueue<datagram_t> *s)
{
    Parser::thisPtr = this;
    config = c;
    safe_queue = s;
}

bool Parser::parse(Tins::PDU &pdu)
{
    Parser *_this = Parser::thisPtr;
    datagram_t datagram;

    // TCP?
    const Tins::TCP *tcp_p = pdu.find_pdu<Tins::TCP>();
    if (tcp_p != nullptr)
    {
        datagram.layer_4_type = pdutype_to_string(tcp_p->pdu_type());
        datagram.layer_4_src_port = std::to_string(tcp_p->sport());
        datagram.layer_4_dst_port = std::to_string(tcp_p->dport());

        if (datagram.payload_type == "")
        {
            if (tcp_p->find_pdu<Tins::RawPDU>() != nullptr)
            {
                datagram.payload_type = pdutype_to_string(tcp_p->pdu_type());
                datagram.payload_size = std::to_string(tcp_p->find_pdu<Tins::RawPDU>()->payload_size());
                if (_this->config.payload_convert_method == "hex")
                {
                    datagram.payload_encoding_type = "hex";
                    datagram.payload = uint8_vector_to_hex_string(tcp_p->find_pdu<Tins::RawPDU>()->payload());
                }
                else
                {
                    datagram.payload_encoding_type = "base64";
                    datagram.payload = uint8_vector_to_base64_string(tcp_p->find_pdu<Tins::RawPDU>()->payload());
                }
            }
        }
    }

    // UDP?
    const Tins::UDP *udp_p = pdu.find_pdu<Tins::UDP>();
    if (udp_p != nullptr)
    {
        datagram.layer_4_type = pdutype_to_string(udp_p->pdu_type());
        datagram.layer_4_src_port = std::to_string(udp_p->sport());
        datagram.layer_4_dst_port = std::to_string(udp_p->dport());

        if (datagram.payload_type == "")
        {
            if (udp_p->find_pdu<Tins::RawPDU>() != nullptr)
            {
                datagram.payload_type = pdutype_to_string(udp_p->pdu_type());
                datagram.payload_size = std::to_string(udp_p->find_pdu<Tins::RawPDU>()->payload_size());
                const Tins::RawPDU::payload_type &udp_payload = udp_p->find_pdu<Tins::RawPDU>()->payload();

                if (_this->config.payload_convert_method == "hex")
                {
                    datagram.payload_encoding_type = "hex";
                    datagram.payload = uint8_vector_to_hex_string(udp_payload);
                }
                else
                {
                    datagram.payload_encoding_type = "base64";
                    datagram.payload = uint8_vector_to_base64_string(udp_payload);
                }
            }
        }
    }

    // ICMP?
    const Tins::ICMP *icmp_p = pdu.find_pdu<Tins::ICMP>();
    if (icmp_p != nullptr)
    {
        datagram.layer_4_type = pdutype_to_string(icmp_p->pdu_type());

        if (datagram.payload_type == "")
        {
            if (icmp_p->find_pdu<Tins::RawPDU>() != nullptr)
            {
                datagram.payload_type = pdutype_to_string(icmp_p->pdu_type());
                datagram.payload_size = std::to_string(icmp_p->find_pdu<Tins::RawPDU>()->payload_size());
                if (_this->config.payload_convert_method == "hex")
                {
                    datagram.payload_encoding_type = "hex";
                    datagram.payload = uint8_vector_to_hex_string(icmp_p->find_pdu<Tins::RawPDU>()->payload());
                }
                else
                {
                    datagram.payload_encoding_type = "base64";
                    datagram.payload = uint8_vector_to_base64_string(icmp_p->find_pdu<Tins::RawPDU>()->payload());
                }
            }
        }
    }

    // ICMPv6?
    const Tins::ICMPv6 *icmpv6_p = pdu.find_pdu<Tins::ICMPv6>();
    if (icmpv6_p != nullptr)
    {
        datagram.layer_4_type = pdutype_to_string(icmpv6_p->pdu_type());

        if (datagram.payload_type == "")
        {
            if (icmpv6_p->find_pdu<Tins::RawPDU>() != nullptr)
            {
                datagram.payload_type = pdutype_to_string(icmpv6_p->pdu_type());
                datagram.payload_size = std::to_string(icmpv6_p->find_pdu<Tins::RawPDU>()->payload_size());
                if (_this->config.payload_convert_method == "hex")
                {
                    datagram.payload_encoding_type = "hex";
                    datagram.payload = uint8_vector_to_hex_string(icmpv6_p->find_pdu<Tins::RawPDU>()->payload());
                }
                else
                {
                    datagram.payload_encoding_type = "base64";
                    datagram.payload = uint8_vector_to_base64_string(icmpv6_p->find_pdu<Tins::RawPDU>()->payload());
                }
            }
        }
    }

    // IPv4?
    const Tins::IP *ip_p = pdu.find_pdu<Tins::IP>();
    if (ip_p != nullptr)
    {
        datagram.layer_3_type = pdutype_to_string(ip_p->pdu_type());
        datagram.layer_3_src_addr = ip_p->src_addr().to_string();
        datagram.layer_3_dst_addr = ip_p->dst_addr().to_string();

        if (datagram.payload_type == "")
        {
            if (ip_p->find_pdu<Tins::RawPDU>() != nullptr)
            {
                datagram.payload_type = pdutype_to_string(ip_p->pdu_type());
                datagram.payload_size = std::to_string(ip_p->find_pdu<Tins::RawPDU>()->payload_size());
                if (_this->config.payload_convert_method == "hex")
                {
                    datagram.payload_encoding_type = "hex";
                    datagram.payload = uint8_vector_to_hex_string(ip_p->find_pdu<Tins::RawPDU>()->payload());
                }
                else
                {
                    datagram.payload_encoding_type = "base64";
                    datagram.payload = uint8_vector_to_base64_string(ip_p->find_pdu<Tins::RawPDU>()->payload());
                }
            }
        }
    }

    // IPv6?
    const Tins::IPv6 *ipv6_p = pdu.find_pdu<Tins::IPv6>();
    if (ipv6_p != nullptr)
    {
        datagram.layer_3_type = pdutype_to_string(ipv6_p->pdu_type());
        datagram.layer_3_src_addr = ipv6_p->src_addr().to_string();
        datagram.layer_3_dst_addr = ipv6_p->dst_addr().to_string();

        if (datagram.payload_type == "")
        {
            if (ipv6_p->find_pdu<Tins::RawPDU>() != nullptr)
            {
                datagram.payload_type = pdutype_to_string(ipv6_p->pdu_type());
                datagram.payload_size = std::to_string(ipv6_p->find_pdu<Tins::RawPDU>()->payload_size());
                if (_this->config.payload_convert_method == "hex")
                {
                    datagram.payload_encoding_type = "hex";
                    datagram.payload = uint8_vector_to_hex_string(ipv6_p->find_pdu<Tins::RawPDU>()->payload());
                }
                else
                {
                    datagram.payload_encoding_type = "base64";
                    datagram.payload = uint8_vector_to_base64_string(ipv6_p->find_pdu<Tins::RawPDU>()->payload());
                }
            }
        }
    }

    // ARP?
    const Tins::ARP *arp_p = pdu.find_pdu<Tins::ARP>();
    if (arp_p != nullptr)
    {
        datagram.layer_2_type = pdutype_to_string(arp_p->pdu_type());

        if (datagram.payload_type == "")
        {
            if (arp_p->find_pdu<Tins::RawPDU>() != nullptr)
            {
                datagram.payload_type = pdutype_to_string(arp_p->pdu_type());
                datagram.payload_size = std::to_string(arp_p->find_pdu<Tins::RawPDU>()->payload_size());
                if (_this->config.payload_convert_method == "hex")
                {
                    datagram.payload_encoding_type = "hex";
                    datagram.payload = uint8_vector_to_hex_string(arp_p->find_pdu<Tins::RawPDU>()->payload());
                }
                else
                {
                    datagram.payload_encoding_type = "base64";
                    datagram.payload = uint8_vector_to_base64_string(arp_p->find_pdu<Tins::RawPDU>()->payload());
                }
            }
        }
    }

    // Ethernet?
    const Tins::EthernetII *ethernet_p = pdu.find_pdu<Tins::EthernetII>();
    if (ethernet_p != nullptr)
    {
        datagram.layer_2_type = pdutype_to_string(ethernet_p->pdu_type());
        datagram.layer_2_src_addr = ethernet_p->src_addr().to_string();
        datagram.layer_2_dst_addr = ethernet_p->dst_addr().to_string();

        if (datagram.payload_type == "")
        {
            if (ethernet_p->find_pdu<Tins::RawPDU>() != nullptr)
            {
                datagram.payload_type = pdutype_to_string(ethernet_p->pdu_type());
                datagram.payload_size = std::to_string(ethernet_p->find_pdu<Tins::RawPDU>()->payload_size());
                if (_this->config.payload_convert_method == "hex")
                {
                }
                else
                {
                    datagram.payload_encoding_type = "base64";
                    datagram.payload = uint8_vector_to_base64_string(ethernet_p->find_pdu<Tins::RawPDU>()->payload());
                }
            }
        }
    }

    _this->safe_queue->push(datagram);

    std::cout << datagram.layer_2_type << " "
              << datagram.layer_2_src_addr << " -> "
              << datagram.layer_2_dst_addr << ", "
              << datagram.layer_3_type << " "
              << datagram.layer_3_src_addr << " -> "
              << datagram.layer_3_dst_addr << ", "
              << datagram.layer_4_type << " "
              << datagram.layer_4_src_port << " -> "
              << datagram.layer_4_dst_port << " (Payload: "
              << datagram.payload_type << ", "
              << datagram.payload_size << " bytes)"
              << std::endl;

    return true;
}

std::string Parser::pdutype_to_string(const Tins::PDU::PDUType p)
{
    switch (p)
    {
    case Tins::PDU::PDUType::RAW:
        return "RAW";
    case Tins::PDU::PDUType::ETHERNET_II:
        return "ETHERNET_II";
    case Tins::PDU::PDUType::IEEE802_3:
        return "IEEE802_3";
    case Tins::PDU::PDUType::RADIOTAP:
        return "RADIOTAP";
    case Tins::PDU::PDUType::DOT11:
        return "DOT11";
    case Tins::PDU::PDUType::DOT11_ACK:
        return "DOT11_ACK";
    case Tins::PDU::PDUType::DOT11_ASSOC_REQ:
        return "DOT11_ASSOC_REQ";
    case Tins::PDU::PDUType::DOT11_ASSOC_RESP:
        return "DOT11_ASSOC_RESP";
    case Tins::PDU::PDUType::DOT11_AUTH:
        return "DOT11_AUTH";
    case Tins::PDU::PDUType::DOT11_BEACON:
        return "DOT11_BEACON";
    case Tins::PDU::PDUType::DOT11_BLOCK_ACK:
        return "DOT11_BLOCK_ACK";
    case Tins::PDU::PDUType::DOT11_BLOCK_ACK_REQ:
        return "DOT11_BLOCK_ACK_REQ";
    case Tins::PDU::PDUType::DOT11_CF_END:
        return "DOT11_CF_END";
    case Tins::PDU::PDUType::DOT11_DATA:
        return "DOT11_DATA";
    case Tins::PDU::PDUType::DOT11_CONTROL:
        return "DOT11_CONTROL";
    case Tins::PDU::PDUType::DOT11_DEAUTH:
        return "DOT11_DEAUTH";
    case Tins::PDU::PDUType::DOT11_DIASSOC:
        return "DOT11_DIASSOC";
    case Tins::PDU::PDUType::DOT11_END_CF_ACK:
        return "DOT11_END_CF_ACK";
    case Tins::PDU::PDUType::DOT11_MANAGEMENT:
        return "DOT11_MANAGEMENT";
    case Tins::PDU::PDUType::DOT11_PROBE_REQ:
        return "DOT11_PROBE_REQ";
    case Tins::PDU::PDUType::DOT11_PROBE_RESP:
        return "DOT11_PROBE_RESP";
    case Tins::PDU::PDUType::DOT11_PS_POLL:
        return "DOT11_PS_POLL";
    case Tins::PDU::PDUType::DOT11_REASSOC_REQ:
        return "DOT11_REASSOC_REQ";
    case Tins::PDU::PDUType::DOT11_REASSOC_RESP:
        return "DOT11_REASSOC_RESP";
    case Tins::PDU::PDUType::DOT11_RTS:
        return "DOT11_RTS";
    case Tins::PDU::PDUType::DOT11_QOS_DATA:
        return "DOT11_QOS_DATA";
    case Tins::PDU::PDUType::LLC:
        return "LLC";
    case Tins::PDU::PDUType::SNAP:
        return "SNAP";
    case Tins::PDU::PDUType::IP:
        return "IP";
    case Tins::PDU::PDUType::ARP:
        return "ARP";
    case Tins::PDU::PDUType::TCP:
        return "TCP";
    case Tins::PDU::PDUType::UDP:
        return "UDP";
    case Tins::PDU::PDUType::ICMP:
        return "ICMP";
    case Tins::PDU::PDUType::BOOTP:
        return "BOOTP";
    case Tins::PDU::PDUType::DHCP:
        return "DHCP";
    case Tins::PDU::PDUType::EAPOL:
        return "EAPOL";
    case Tins::PDU::PDUType::RC4EAPOL:
        return "RC4EAPOL";
    case Tins::PDU::PDUType::RSNEAPOL:
        return "RSNEAPOL";
    case Tins::PDU::PDUType::DNS:
        return "DNS";
    case Tins::PDU::PDUType::LOOPBACK:
        return "LOOPBACK";
    case Tins::PDU::PDUType::IPv6:
        return "IPv6";
    case Tins::PDU::PDUType::ICMPv6:
        return "ICMPv6";
    case Tins::PDU::PDUType::SLL:
        return "SLL";
    case Tins::PDU::PDUType::DHCPv6:
        return "DHCPv6";
    case Tins::PDU::PDUType::DOT1Q:
        return "DOT1Q";
    case Tins::PDU::PDUType::PPPOE:
        return "PPPOE";
    case Tins::PDU::PDUType::STP:
        return "STP";
    case Tins::PDU::PDUType::PPI:
        return "PPI";
    case Tins::PDU::PDUType::IPSEC_AH:
        return "IPSEC_AH";
    case Tins::PDU::PDUType::IPSEC_ESP:
        return "IPSEC_ESP";
    case Tins::PDU::PDUType::PKTAP:
        return "PKTAP";
    case Tins::PDU::PDUType::MPLS:
        return "MPLS";
    case Tins::PDU::PDUType::UNKNOWN:
        return "UNKNOWN";
    case Tins::PDU::PDUType::USER_DEFINED_PDU:
        return "USER_DEFINED_PDU";
    default:
        return "unknown_type_" + std::to_string(p);
    }
}

std::string Parser::uint8_vector_to_hex_string(const std::vector<uint8_t> &v)
{
    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    std::vector<uint8_t>::const_iterator it;

    for (it = v.begin(); it != v.end(); it++)
    {
        ss << std::setw(2) << static_cast<unsigned>(*it);
    }

    return ss.str();
}

std::string Parser::uint8_vector_to_base64_string(const std::vector<uint8_t> &v)
{
    const std::string table("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
    std::string cdst;

    for (std::size_t i = 0; i < v.size(); ++i)
    {
        switch (i % 3)
        {
        case 0:
            cdst.push_back(table[(v[i] & 0xFC) >> 2]);
            if (i + 1 == v.size())
            {
                cdst.push_back(table[(v[i] & 0x03) << 4]);
                cdst.push_back('=');
                cdst.push_back('=');
            }

            break;
        case 1:
            cdst.push_back(table[((v[i - 1] & 0x03) << 4) | ((v[i + 0] & 0xF0) >> 4)]);
            if (i + 1 == v.size())
            {
                cdst.push_back(table[(v[i] & 0x0F) << 2]);
                cdst.push_back('=');
            }

            break;
        case 2:
            cdst.push_back(table[((v[i - 1] & 0x0F) << 2) | ((v[i + 0] & 0xC0) >> 6)]);
            cdst.push_back(table[v[i] & 0x3F]);

            break;
        }
    }

    return cdst;
}

uint16_t Parser::uint8_vector_to_uint16(const std::vector<uint8_t> &v, int i)
{
    return (uint16_t)((v[i] << 8) | v[i + 1]);
}

uint32_t Parser::uint8_vector_to_uint32(const std::vector<uint8_t> &v, int i)
{
    return (uint32_t)((((((v[i] << 8) | v[i + 1]) << 8) | v[i + 2]) << 8) | v[i + 3]);
}