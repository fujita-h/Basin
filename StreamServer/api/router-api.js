const express = require('express')
const Redis = require('ioredis');
const { async } = require('rxjs/internal/scheduler/async');

const router = express.Router()
const redis = new Redis()

function createResultObject(data, error = null) {
    return {
        timestamp: (new Date()).getTime(),
        data: data,
        error: error,
    }
}

const getKeys = () => {
    return new Promise((resolve, reject) => {
        redis.keys('*').then((keys) => {
            if (keys.length == 0) {
                return resolve([]);
            }
            let pipeline = redis.pipeline()
            keys.forEach(key => {
                pipeline.type(key)
            });
            pipeline.exec().then((results) => {
                if (keys.length != results.length) {
                    return reject('unknown error (-1)');
                }
                let data = []
                for (let i = 0; i < keys.length; i++) {
                    if (results[i][0] != null) {
                        data.push({ key: keys[i], type: 'unknown' })
                    } else {
                        data.push({ key: keys[i], type: results[i][1] })
                    }
                }

                // sort
                data = data.sort((a, b) => {
                    a = a.key.toString().toLowerCase();
                    b = b.key.toString().toLowerCase();
                    if (a < b) {
                        return -1;
                    } else if (a > b) {
                        return 1;
                    }
                    return 0
                })


                return resolve(data);
            }).catch((err) => reject(err))
        }).catch((err) => reject(err))
    });
}

const getKeyInfo = (key) => {
    return new Promise((resolve, reject) => {
        redis.type(key).then((type) => {
            if (type == "stream") {
                let pipeline = redis.pipeline()
                pipeline.xrange(key, '-', '+', 'COUNT', '1')
                pipeline.xrevrange(key, '+', '-', 'COUNT', '1')
                pipeline.exec().then((results) => {
                    if (results.length != 2) { return reject('unknown error (-1)') }
                    let smallestId = results[0][0] == null ? results[0][1][0][0] : 'unknown'
                    let greatestId = results[1][0] == null ? results[1][1][0][0] : 'unknown'
                    return resolve({ key, type, smallestId, greatestId })
                }).catch((err) => reject(err))
            } else {
                return resolve({ key, type })
            }
        }).catch((err) => reject(err))
    })
}

const getStreamIds = (key, start, end, count) => {
    return new Promise((resolve, reject) => {
        getStreamItems(key, start, end, count).then((data) => {
            resolve({ key, ids: data.items.map(x => x[0]) })
        }).catch((err) => reject(err))
    }).catch((err) => reject(err))
}


const getStreamItems = (key, start, end, count) => {
    return new Promise((resolve, reject) => {
        redis.type(key).then((type) => {
            if (type != "stream") { return reject('not stream') }
            let cmd = count == null ? [key, start, end] : [key, start, end, 'COUNT', count]
            redis.xrange(cmd).then((items) => {
                resolve({ key, start, end, items })
            }).catch((err) => reject(err))
        }).catch((err) => reject(err))
    })
}

router.get('/a', async (req, res) => {
    res.send('a')
})

router.get('/keys', async (req, res) => {
    getKeys().then((data) => {
        return res.status(200).json(createResultObject(data));
    }).catch((err) => {
        return res.status(503).json(createResultObject(null, err));
    })
})

router.get('/key/info', async (req, res) => {
    if (!req.query.key) {
        return res.status(400).json(createResultObject(null, "invalid params"));
    }
    getKeyInfo(req.query.key).then((data) => {
        return res.status(200).json(createResultObject(data));
    }).catch((err) => {
        return res.status(503).json(createResultObject(null, err));
    })
})

router.get('/streams', async (req, res) => {
    getKeys().then((data) => {
        return res.status(200).json(createResultObject(data.filter(x => x.type == 'stream')));
    }).catch((err) => {
        return res.status(503).json(createResultObject(null, err));
    })
})

router.get('/stream/ids', async (req, res) => {
    if (!req.query.key) {
        return res.status(400).json(createResultObject(null, "invalid params"));
    }
    let start = req.query.start ? req.query.start : '-'
    let end = req.query.end ? req.query.end : '+'
    let count = req.query.count ? req.query.count : null
    getStreamIds(req.query.key, start, end, count).then((data) => {
        return res.status(200).json(createResultObject(data));
    }).catch((err) => {
        return res.status(503).json(createResultObject(null, err));
    })
})

router.get('/stream/items', async (req, res) => {
    if (!req.query.key) {
        return res.status(400).json(createResultObject(null, "invalid params"));
    }
    let start = req.query.start ? req.query.start : '-'
    let end = req.query.end ? req.query.end : '+'
    let count = req.query.count ? req.query.count : null
    getStreamItems(req.query.key, start, end, count).then((data) => {
        return res.status(200).json(createResultObject(data));
    }).catch((err) => {
        return res.status(503).json(createResultObject(null, err));
    })
})

module.exports = router;