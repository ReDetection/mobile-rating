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
                checkParams = function (data) {
                    return data.deviceId.length
                        && data.appVersion.length
                        && data.appVersion.length < 11
                        && data.rating >= config.minRate
                        && data.rating <= config.maxRate;
                };

            try {
                var data = url.parse('http://host?' + rawData, true) || {query: {}};
                if (checkParams(data.query)) {
                    var now = new Date(),
                        m = now.getMonth() + 1,
                        key = [
                            now.getFullYear(),
                            (m < 10 ? '0' : '') + m,
                            now.getDate(),
                            now.getUTCHours(),
                            now.getUTCMinutes(),
                            now.getUTCSeconds(),
                            now.getUTCMilliseconds(),
                            data.query.appVersion,
                            sha1(data.query.deviceId)
                        ].join('-');
                    try {
                        redisClient.set(
                            key,
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
