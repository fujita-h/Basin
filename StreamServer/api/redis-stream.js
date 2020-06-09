const Rx = require('rxjs/Rx');
const Redis = require('ioredis');

function RedisStream(redis_hostname, redis_port, redis_database) {
    this.redis_config = {
        port : redis_port,
        host : redis_hostname,
        db: redis_database
    }
}

//let redis = new Redis()
// redis = new Redis(address);
// redis = new Redis.Cluster(addresses);

const cache = {}

RedisStream.prototype.observeNewRedisStreamEvent = function observeNewRedisStreamEvent(key, startId = '$') {

    if (cache[key]) return cache[key]

    let nextId = startId
    
    let redis = new Redis(this.redis_config)

    return cache[key] = Rx.Observable.of(null)
        .expand(() => {
            if (nextId == '$') {
                return Rx.Observable.fromPromise(redis.xread('BLOCK', '0', 'COUNT', '100', 'STREAMS', key, nextId))
            } else {
                return Rx.Observable.fromPromise(redis.xread('BLOCK', '10', 'COUNT', '10000', 'STREAMS', key, nextId))
            }
        })
        .filter(streams => streams)
        .flatMap(streams => streams)
        .flatMap(stream => stream[1])
        .do(streamEvent => {
            let lastIds = streamEvent[0].split('-')
            let nextIds = nextId.replace('$', '0-0').split('-')

            if (!nextId ||
                (Number(lastIds[0]) > Number(nextIds[0])) ||
                (Number(lastIds[0]) == Number(nextIds[0]) && Number(lastIds[1]) > Number(nextIds[1]))
            ) {
                nextId = streamEvent[0];
            }
        })
        .finally(() => {
            redis.quit();
            delete cache[key];
        })
        .publish()
        .refCount();
}

module.exports = RedisStream;
