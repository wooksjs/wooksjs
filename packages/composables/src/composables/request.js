"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useRouteParams = exports.useRequest = void 0;
const core_1 = require("../core");
const crypto_1 = require("crypto");
const cache_1 = require("../cache");
const xForwardedFor = 'x-forwarded-for';
function useRequest() {
    const reqHandle = (0, cache_1.useCacheStore)(core_1.innerCacheSymbols.request);
    const { req } = (0, core_1.useWooksCtx)().getCtx();
    async function rawBody() {
        if (!reqHandle.has('rawBody')) {
            return reqHandle.set('rawBody', new Promise((resolve, reject) => {
                let body = Buffer.from('');
                req.on('data', function (chunk) {
                    body = Buffer.concat([body, chunk]);
                });
                req.on('error', function (err) {
                    reject(err);
                });
                req.on('end', function () {
                    resolve(body);
                });
            }));
        }
        return reqHandle.get('rawBody');
    }
    function reqId() {
        if (!reqHandle.has('reqId')) {
            return reqHandle.set('reqId', (0, crypto_1.randomUUID)());
        }
        return reqHandle.get('reqId');
    }
    function getIp(options) {
        if (options?.trustProxy) {
            if (!reqHandle.has('forwardedIp')) {
                if (typeof req.headers[xForwardedFor] === 'string' && req.headers[xForwardedFor]) {
                    return reqHandle.set('forwardedIp', req.headers[xForwardedFor].split(',').shift()?.trim());
                }
                else {
                    return getIp();
                }
            }
            return reqHandle.get('forwardedIp');
        }
        else {
            if (!reqHandle.has('remoteIp')) {
                return reqHandle.set('remoteIp', req.socket?.remoteAddress || req.connection?.remoteAddress || '');
            }
            return reqHandle.get('remoteIp');
        }
    }
    function getIpList() {
        if (!reqHandle.has('ipList')) {
            return reqHandle.set('ipList', {
                remoteIp: req.socket?.remoteAddress || req.connection?.remoteAddress || '',
                forwarded: (req.headers[xForwardedFor] || '').split(',').map(s => s.trim()),
            });
        }
        return reqHandle.get('ipList');
    }
    return {
        rawRequest: req,
        url: req.url,
        method: req.method,
        headers: req.headers,
        rawBody,
        reqId,
        getIp,
        getIpList,
    };
}
exports.useRequest = useRequest;
function useRouteParams() {
    const routeParams = (0, core_1.useWooksCtx)().getCtx().params;
    function getRouteParam(name) {
        return routeParams[name];
    }
    return {
        routeParams,
        getRouteParam,
    };
}
exports.useRouteParams = useRouteParams;
