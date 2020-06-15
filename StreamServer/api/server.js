require('supports-color')
const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const Rx = require('rxjs/Rx');
const RedisStream = require('./redis-stream');
const WebSocketServer = require('ws').Server
const Speech = require('@google-cloud/speech').v1p1beta1;
const debug = require('debug')('streamserver');
const debug_performance = require('debug')('streamserver:performance')
const util = require('util');

const FLAG_RTP = 'rtp'
const FLAG_GOOGLE_REALTIME_TEXT = 'google-realtime-text'

function Server(serverSettings, redisSettings) {
    this.port = serverSettings.port
    this.webSocketPath = serverSettings.wsPath

    this.server = null
    this.webConnections = []
    this.websocketConnections = []

    this.stream = new RedisStream(redisSettings.host, redisSettings.port, redisSettings.db);

}

Server.prototype.start = function () {
    debug("start() called.")
    var app = express()
    app.use(bodyParser.json())

    // import router api
    app.use('/api', require('./router-api'));

    // Static Content
    app.use('/', express.static(path.join(process.cwd(), '../static_content_root')))

    // Start Web Server
    this.server = app.listen(this.port)
    debug('Server Starting on port %s', this.port)
    this.server.on('connection', connection => {
        this.webConnections.push(connection);
        connection.on('close', () => connections = this.webConnections.filter(curr => curr !== connection));
    });

    // Start WebSocket Server
    var webSocketServer = new WebSocketServer({ server: this.server, path: this.webSocketPath })

    Rx.Observable.fromEvent(webSocketServer, 'connection')
        .filter(event => event)
        .flatMap(event => {

            websocket = event[0]
            request = event[1]

            const disconnect$ = Rx.Observable.fromEvent(websocket, 'close')
                .do(() => {
                    debug("socket disconnected.")

                    // remove socket
                    this.websocketConnections.splice(this.websocketConnections.indexOf(websocket), 1)
                });

            this.websocketConnections.push(websocket);

            // parse query
            let queryString = request.url.replace(new RegExp("^" + this.webSocketPath), "");
            let queries = [...new URLSearchParams(queryString).entries()].reduce((obj, e) => ({ ...obj, [e[0]]: e[1] }), {});
            let key = queries.key ? queries.key : null;
            let parse = queries.parse ? queries.parse.toLowerCase().split(',') : null
            let filter = queries.filter ? queries.filter.toLowerCase().split(',') : null


            // Google Speech to Text
            let speechClient = null;
            let recognizeStream = null;
            let flag_end_of_single_utterance = false;
            let flag_isFinal = false;
            let voiceCache = [];
            const speechRequest = {
                config: {
                    encoding: "MULAW",
                    sampleRateHertz: 8000,
                    languageCode: "ja-JP",
                    enableAutomaticPunctuation: true,
                },
                singleUtterance: true,
                interimResults: true,
            };
            const speechCallback = data => {
                //console.log(util.inspect(data, false, null))
                if (data.speechEventType == 'END_OF_SINGLE_UTTERANCE') {
                    flag_end_of_single_utterance = true;
                    console.log("flag_end_of_single_utterance <= true")
                } else if (data.speechEventType == 'SPEECH_EVENT_UNSPECIFIED') {
                    if (data.results && data.results[0]) {
                        if (data.results[0].isFinal == true) {
                            console.log("flag_isFinal <= true")
                            flag_isFinal = true;
                        }
                        console.log(data.results[0].alternatives[0].transcript);
                    }
                }

                if (flag_end_of_single_utterance && flag_isFinal) {
                    console.log("recognizeStream is finished. closing.")
                    flag_end_of_single_utterance = false;
                    flag_isFinal = false;
                    recognizeStream.removeListener('data', speechCallback);
                    recognizeStream = null;
                }

            };
            if (parse && parse.includes(FLAG_GOOGLE_REALTIME_TEXT)) {
                speechClient = new Speech.SpeechClient();
            }


            if (!key) {
                websocket.close()
            } else {
                let remote = request.headers['x-forwarded-for'] ||
                    request.connection.remoteAddress ||
                    request.socket.remoteAddress ||
                    (request.connection.socket ? request.connection.socket.remoteAddress : null);
                debug('WebSocket connected:', 'remote=>', remote, ', key=>', key)
            }

            return this.stream.observeNewRedisStreamEvent(key) // get a poller
                .do(message => {
                    //console.log(message)

                    // message format belongs to Redis Stream,
                    // [ key, [ filed_1, string_1, field_2, string_2, ... ] ]

                    let timestamp = message[0]
                    let dataArray = message[1]
                    let data = { layer_2: {}, layer_3: {}, layer_4: {}, payload: {} }
                    for (let i = 0; i < Math.floor(dataArray.length / 2); i++) {
                        let k = dataArray[i * 2]
                        let v = dataArray[i * 2 + 1]

                        if (k.endsWith('size') || k.endsWith('port')) {
                            v = Number(v)
                        }

                        if (k.startsWith('layer_2_')) {
                            data.layer_2[k.replace('layer_2_', '')] = v
                        } else if (k.startsWith('layer_3_')) {
                            data.layer_3[k.replace('layer_3_', '')] = v
                        } else if (k.startsWith('layer_4_')) {
                            data.layer_4[k.replace('layer_4_', '')] = v
                        } else if (k.startsWith('payload_')) {
                            data.payload[k.replace('payload_', '')] = v
                        } else {
                            data[k] = v
                        }
                    }

                    //debug(data)
                    if (parse && parse.includes(FLAG_GOOGLE_REALTIME_TEXT)) {
                        parse[FLAG_RTP] = 1;
                    }
                    
                    if (parse && parse.includes(FLAG_RTP) && data.payload.type == 'UDP' && data.payload && data.payload.size > 0) {
                        let rtp_valid = true
                        let buffer = null;
                        let rtp = {}
                        rtp.header_length = 12;

                        // convert payload to Buffer
                        if (data.payload.encoding_type == 'base64') {
                            rtp.payload_encoding_type = 'base64'
                            buffer = Buffer.from(data.payload.payload, 'base64')
                        } else if (data.payload.encoding_type == 'hex') {
                            rtp.payload.encoding_type = 'hex'
                            buffer = Buffer.from(data.payload.payload, 'hex')
                        } else {
                            rtp.payload_encoding_type = 'base64'
                        }

                        // Check Basic Header
                        if (rtp_valid && buffer && buffer.length >= rtp.header_length) {
                            rtp.version = buffer[0] >> 6
                            if (rtp.version == 2) {
                                rtp.padding = (buffer[0] & 0b00100000) >> 5
                                rtp.extension = (buffer[0] & 0b00010000) >> 4
                                rtp.csrc_count = (buffer[0] & 0b00001111)
                                rtp.marker = buffer[1] >> 7
                                rtp.payload_type = (buffer[1] & 0b01111111) >> 1
                                rtp.sequence_number = ((buffer[2] << 8) | buffer[3]) >>> 0
                                rtp.timestamp = (((((buffer[4] << 8) | buffer[5]) << 8) | buffer[6]) << 8 | buffer[7]) >>> 0
                                rtp.ssrc = (((((buffer[8] << 8) | buffer[9]) << 8) | buffer[10]) << 8 | buffer[11]) >>> 0
                            } else {
                                rtp_valid = false
                            }
                        } else {
                            rtp_valid = false
                        }

                        // check CSRC Header
                        if (rtp.csrc_count > 0) {
                            if (rtp_valid && buffer && buffer.length >= rtp.header_length + 4 * rtp.csrc_count) {
                                let csrc_payload = buffer.slice(rtp.header_length, rtp.header_length + 4 * rtp.csrc_count)
                                if (rtp.payload_encoding_type == "base64") {
                                    rtp.csrc_payload = csrc_payload.toString("base64")
                                } else if (rtp.payload_encoding_type == "hex") {
                                    rtp.csrc_payload = csrc_payload.toString("hex")
                                }
                                rtp.header_length = rtp.header_length + 4 * rtp.csrc_count;
                            }
                            else {
                                rtp_valid = false
                            }
                        }

                        // check Extension
                        if (rtp.extension == 1) {
                            // check Extension Header ID/Length
                            if (rtp_valid && buffer && buffer.length >= rtp.header_length + 4) {
                                rtp.extension_header_id = ((buffer[rtp.header_length] << 8) | buffer[rtp.header_length + 1]) >>> 0
                                rtp.extension_header_length = ((buffer[rtp.header_length + 2] << 8) | buffer[rtp.header_length + 3]) >>> 0
                            } else {
                                rtp_valid = false
                            }

                            // check Extension Header
                            if (rtp_valid && buffer && rtp.extension_header_length > 0 && buffer.length >= rtp.header_length + rtp.extension_header_length) {
                                let extension_header_payload = buffer.slice(rtp.header_length, rtp.header_length + rtp.extension_header_length)
                                if (rtp.payload_encoding_type == "base64") {
                                    rtp.extension_header_payload = extension_header_payload.toString("base64")
                                } else if (rtp.payload_encoding_type == "hex") {
                                    rtp.extension_header_payload = extension_header_payload.toString("hex")
                                }
                                rtp.header_length = rtp.header_length + rtp.extension_header_length;
                            } else {
                                rtp_valid = false
                            }
                        }

                        // check payload
                        let rtp_payload = null;
                        if (rtp_valid && buffer && buffer.length > rtp.header_length) {
                            rtp_payload = buffer.slice(rtp.header_length)
                            if (rtp.payload_encoding_type == "base64") {
                                rtp.payload = rtp_payload.toString("base64")
                            } else if (rtp.payload_encoding_type == "hex") {
                                rtp.payload = rtp_payload.toString("hex")
                            }
                            rtp.payload_length = rtp_payload.length
                        }
                        else {
                            rtp_valid = false
                        }

                        if (rtp_valid) {
                            data.rtp = rtp
                            if (parse.includes(FLAG_GOOGLE_REALTIME_TEXT)) {
                                if (!recognizeStream) {
                                    console.log("recognizeStream is null. create new one.")
                                    recognizeStream = speechClient
                                        .streamingRecognize(speechRequest)
                                        .on('error', err => {
                                            console.error(err)
                                        })
                                        .on('data', speechCallback);
                                }

                                if (rtp_payload) {
                                    if (flag_end_of_single_utterance) {
                                        voiceCache.push(rtp_payload)
                                    } else {
                                        while ((x = voiceCache.shift()) != undefined) {
                                            recognizeStream.write(x);
                                        }
                                        recognizeStream.write(rtp_payload);

                                    }
                                }
                            }
                        }

                    }  // end of parse_rtp

                    // filter
                    if (filter) {
                        filter.forEach(x => {
                            if (data[x]) {
                                delete data[x];
                            }
                        });
                    }

                    // send message
                    websocket.send(JSON.stringify({ timestamp: timestamp, data: data }));
                })
                .takeUntil(disconnect$); // read new message until socket disconnects
        })
        .finally(() => {
            // disconnect all sockets
            this.websocketConnections.forEach((websocket) => { websocket.close() })
        })
        .takeUntil(
            // listen until server stop signal
            Rx.Observable.merge(
                Rx.Observable.fromEvent(process, 'SIGINT'),
                Rx.Observable.fromEvent(process, 'SIGTERM')
            ))
        .subscribe(() => { });

    setInterval(() => {
        let heapUsed = process.memoryUsage().heapUsed;

        let wsQueueBytes = 0;
        let wsConnectionCount = 0;
        this.websocketConnections.forEach(element => {
            wsQueueBytes += element.bufferedAmount
            wsConnectionCount++;
        });

        debug_performance(
            "Heap:" + Math.round(heapUsed / 1024 / 1024 * 100) / 100 + "MB,",
            "WebSocket Conn:", wsConnectionCount, ",",
            "WebSocket Queue:", Math.round(wsQueueBytes / 1024 / 1024 * 100) / 100, "MB")

    }, 10 * 1000);

    debug('server started.')

}

Server.prototype.stop = function () {
    debug("stop() called.")
    try {
        this.webConnections.forEach(x => {
            try {
                x.destroy();
            } catch { }
        })
        this.websocketConnections.forEach(x => {
            try {
                x.close();
            } catch { }
        })
    } catch { }
    debug('server stopped.')
}


module.exports = Server;