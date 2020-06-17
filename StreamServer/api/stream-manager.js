const Rx = require('rxjs/Rx')
const GoogleSpeech = require('./google-speech')
const RedisStream = require('./redis-stream');

const EVENT_TYPE_NETWPRK_PACKET = 'NETWORK_PACKET'
const EVENT_TYPE_GOOGLE_SPEECH_IN = 'GOOGLE_SPEECH_IN'
const EVENT_TYPE_GOOGLE_SPEECH_OUT = 'GOOGLE_SPEECH_IN'

function StreamManager(enableParseRTP = false, enableGoogleSpeech = false) {
    this.enableParseRTP = enableParseRTP
    this.enableGoogleSpeech = enableGoogleSpeech

    this.googleSpeech_IN = enableGoogleSpeech ? new GoogleSpeech() : null;
    this.googleSpeech_OUT = enableGoogleSpeech ? new GoogleSpeech() : null;
    this.stream = new RedisStream("127.0.0.1", 6379, 0);
}

const cache = {}

StreamManager.prototype.observeAllStream = function (key) {
    // すでに作成済の Obervable に対するリクエストだったら、作ったものを返す。
    if (cache[key]) return cache[key]
    console.log(key)
    return cache[key] = Rx.Observable.of(null)
        .merge(this.observeNetworkPacketStream(key))
        .merge(this.observeGoogleSpeechStream())
        .filter(message => message)
        .finally(() => {
            delete cache[key]
        })
        .publish()
        .refCount()

}

StreamManager.prototype.observeNetworkPacketStream = function (key) {
    return this.stream.observeNewRedisStreamEvent(key)
        .filter(message => message)
        .map(message => {
            // message のフォーマットは Redis Stream に準ずる
            // [ key, [ filed_1, string_1, field_2, string_2, ... ] ]
            //
            // このままでは扱いにくいので 平坦なフォーマットを Object に変える
            let eventType = EVENT_TYPE_NETWPRK_PACKET
            let timestamp = message[0]
            let dataArray = message[1]
            let data = {
                layer_2: {},
                layer_3: {},
                layer_4: {},
                payload: {}
            }
            for (let i = 0; i < Math.floor(dataArray.length / 2); i++) {
                // filed_1, string_1, field_2, string_2, ...
                // というデータ構造なので、key, value として Object にする
                let k = dataArray[i * 2]
                let v = dataArray[i * 2 + 1]

                // Redisでの格納値は、元の形式が Number でも string　になるので、
                // Number である項目の値は Number に戻す
                if (k.endsWith('size') || k.endsWith('port')) {
                    v = Number(v)
                }

                // layer_X の値を各々のObjectに格納する
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

            // 次へデータを流す
            return { eventType, timestamp, data }
        })
        .map(message => {
            // RTPをパースして data に付け加える処理
            let eventType = message.eventType
            let timestamp = message.timestamp
            let data = message.data
            let rtp_payload = null;

            // 必要な条件を満たした場合のみ、RTPパースを実行する
            if (this.enableParseRTP == true && data.payload && data.payload.type == 'UDP' && data.payload.size > 0) {
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
                }
            }  // end of parse_rtp

            return { eventType, timestamp, data, rtp_payload }
        })
        .do(message => {
            // Google Speech to Text に RTP ペイロードを送る
            if (this.enableGoogleSpeech && message.rtp_payload && message.data && message.data.layer_3) {
                if (this.googleSpeech_IN && message.data.layer_3.dst_addr && key.includes(message.data.layer_3.dst_addr)) {
                    this.googleSpeech_IN.sendChunk(message.rtp_payload)
                } else if (this.googleSpeech_OUT && message.data.layer_3.src_addr && key.includes(message.data.layer_3.src_addr)) {
                    this.googleSpeech_OUT.sendChunk(message.rtp_payload)
                }
            }
        })
        .map(message => {
            // rtp_payload は不要なので消して流す
            let eventType = message.eventType
            let timestamp = message.timestamp
            let data = message.data
            return { eventType, timestamp, data }
        })
}


StreamManager.prototype.observeGoogleSpeechStream = function () {
    if (this.googleSpeech_IN && this.googleSpeech_OUT) {
        return Rx.Observable.of(null)
            .merge(Rx.Observable.fromEvent(this.googleSpeech_IN, "data")
                .filter(message => message)
                .map(message => {
                    let eventType = EVENT_TYPE_GOOGLE_SPEECH_IN
                    let timestamp = Date.now().toString()
                    let data = message
                    return { eventType, timestamp, data }
                }))
            .merge(Rx.Observable.fromEvent(this.googleSpeech_OUT, "data")
                .filter(message => message)
                .map(message => {
                    let eventType = EVENT_TYPE_GOOGLE_SPEECH_OUT
                    let timestamp = Date.now().toString()
                    let data = message
                    return { eventType, timestamp, data }
                }))
            .filter(message => message)

    } else {
        return Rx.Observable.of(null)
    }
}


module.exports = StreamManager;
