(function () {
    'use strict';

    var http = require('http'),
        redis = require('redis'),
        url = require('url'),
        fs = require('fs'),
        _ = require('lodash'),
        sha1 = require('sha1'),
        config = fs.existsSync('./config.js') && require('./config') || {};

    config.redisDb = config.redisDb || 0;
    config.redisPort = config.redisPort || 6379;
    config.redisHost = config.redisHost || '127.0.0.1';

    config.minRate = config.minRate || 0;
    config.maxRate = config.maxRate || 5;

    var redisClient = redis.createClient(config.redisPort, config.redisHost);
    redisClient.select(config.redisDb);

    var httpServer = http.createServer(function (req, res) {

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type');

        if ('POST' !== req.method.toUpperCase()) {
            res.writeHead(400);
            res.end('');
            return;
        }

        var rawData = '';
        req.on('data', function (chunk) {
            rawData += chunk;
        });

        req.on('end', function () {
            var status = 200,
                zeroPad = function (value, length) {
                    value = value.toString();
                    while (value.length < length) {
                        value = '0' + value;
                    }
                    return value;
                },
                createKey = function (date, data) {
                    return [
                        date.getFullYear(),
                        zeroPad(date.getMonth() + 1, 2),
                        zeroPad(date.getDate(), 2),
                        zeroPad(date.getUTCHours(), 2),
                        zeroPad(date.getUTCMinutes(), 2),
                        zeroPad(date.getUTCSeconds(), 2),
                        zeroPad(date.getUTCMilliseconds(), 3),
                        data.appVersion,
                        sha1(data.deviceId)
                    ].join('-');
                },
                checkParams = function (data) {
                    /**
                     * Params must contain:
                     * - deviceId: string
                     * - appVersion: string
                     * - rating: integer
                     *
                     * Params may contain:
                     * - feedback: string
                     */
                    return data.deviceId.length
                        && data.appVersion.length
                        && data.appVersion.length <= 10
                        && data.rating >= config.minRate
                        && data.rating <= config.maxRate;
                };

            try {
                var data = url.parse('http://host?' + rawData, true) || {query: {}};
                if (checkParams(data.query)) {
                    var now = new Date();
                    try {
                        redisClient.set(
                            createKey(now, data.query),
                            JSON.stringify(_.extend(data.query, {timestamp: now.toUTCString()}))
                        );
                    } catch (e) {
                        status = 500;
                    }
                } else {
                    status = 400;
                }
            } catch (e) {
                status = 400;
            }
            res.writeHead(status);
            res.end('');
        });
    });

    config.host = config.host || '127.0.0.1';
    config.port = config.port || 8080;

    httpServer.listen(config.port, config.host);

    console.log('server listening at http://' + config.host + ':' + config.port);

    module.exports = httpServer;
})();
