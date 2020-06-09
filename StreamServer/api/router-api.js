const express = require('express')
const Redis = require('ioredis');

const router = express.Router()
const redis = new Redis()

function createResultObject(error, data) {
    return {
        timestamp: (new Date()).getTime(),
        error: error,
        data: data,
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

router.get('/a', async (req, res) => {
    res.send('a')
})

router.get('/keys', async (req, res) => {
    data = getKeys().then((data) => {
        return res.status(200).json(createResultObject(null, data));
    }).catch((err) => {
        return res.status(503).json(createResultObject(err, null));
    })
})

router.get('/streams', async (req, res) => {
    data = getKeys().then((data) => {
        return res.status(200).json(createResultObject(null, data.filter(x => x.type == 'stream')));
    }).catch((err) => {
        return res.status(503).json(createResultObject(err, null));
    })
})

module.exports = router;