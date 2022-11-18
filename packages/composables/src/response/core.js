"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseWooksResponse = void 0;
const renderer_1 = require("./renderer");
const composables_1 = require("../composables");
const status_codes_1 = require("../utils/status-codes");
const panic_1 = require("common/panic");
const set_cookie_1 = require("../utils/set-cookie");
const stream_1 = require("stream");
const cache_control_1 = require("../utils/cache-control");
const defaultStatus = {
    GET: status_codes_1.EHttpStatusCode.OK,
    POST: status_codes_1.EHttpStatusCode.Created,
    PUT: status_codes_1.EHttpStatusCode.Created,
    PATCH: status_codes_1.EHttpStatusCode.Accepted,
    DELETE: status_codes_1.EHttpStatusCode.Accepted,
};
const baseRenderer = new renderer_1.BaseWooksResponseRenderer();
class BaseWooksResponse {
    renderer;
    constructor(renderer = baseRenderer) {
        this.renderer = renderer;
    }
    _status = 0;
    _body;
    _headers = {};
    get status() {
        return this._status;
    }
    set status(value) {
        this._status = value;
    }
    get body() {
        return this._body;
    }
    set body(value) {
        this._body = value;
    }
    setStatus(value) {
        this.status = value;
        return this;
    }
    setBody(value) {
        this.body = value;
        return this;
    }
    getContentType() {
        return this._headers['content-type'];
    }
    setContentType(value) {
        this._headers['content-type'] = value;
        return this;
    }
    enableCors(origin = '*') {
        this._headers['Access-Control-Allow-Origin'] = origin;
        return this;
    }
    setCookie(name, value, attrs) {
        const cookies = this._headers['set-cookie'] = (this._headers['set-cookie'] || []);
        cookies.push((0, set_cookie_1.renderCookie)(name, { value, attrs: attrs || {} }));
        return this;
    }
    setCacheControl(data) {
        this.setHeader('cache-control', (0, cache_control_1.renderCacheControl)(data));
    }
    setCookieRaw(rawValue) {
        const cookies = this._headers['set-cookie'] = (this._headers['set-cookie'] || []);
        cookies.push(rawValue);
        return this;
    }
    header(name, value) {
        this._headers[name] = value;
        return this;
    }
    setHeader(name, value) {
        return this.header(name, value);
    }
    getHeader(name) {
        return this._headers[name];
    }
    mergeHeaders() {
        const { headers } = (0, composables_1.useSetHeaders)();
        const { cookies, removeCookie } = (0, composables_1.useSetCookies)();
        const newCookies = (this._headers['set-cookie'] || []);
        for (const cookie of newCookies) {
            removeCookie(cookie.slice(0, cookie.indexOf('=')));
        }
        this._headers = {
            ...headers(),
            ...this._headers,
        };
        const setCookie = [...newCookies, ...cookies()];
        if (setCookie && setCookie.length) {
            this._headers['set-cookie'] = setCookie;
        }
        return this;
    }
    mergeStatus(renderedBody) {
        this.status = this.status || (0, composables_1.useResponse)().status();
        if (!this.status) {
            const { method } = (0, composables_1.useRequest)();
            this.status = renderedBody ? defaultStatus[method] || status_codes_1.EHttpStatusCode.OK : status_codes_1.EHttpStatusCode.NoContent;
        }
        return this;
    }
    async respond() {
        const { rawResponse, hasResponded } = (0, composables_1.useResponse)();
        const { method, rawRequest } = (0, composables_1.useRequest)();
        if (hasResponded()) {
            throw (0, panic_1.panic)('The response was already sent.');
        }
        this.mergeHeaders();
        const res = rawResponse();
        if (this.body instanceof stream_1.Readable) {
            // responding with readable stream
            const stream = this.body;
            this.mergeStatus('ok');
            res.writeHead(this.status, {
                ...this._headers,
            });
            rawRequest.once('close', () => {
                stream.destroy();
            });
            if (method === 'HEAD') {
                stream.destroy();
                res.end();
            }
            else {
                return new Promise((resolve, reject) => {
                    stream.on('error', (e) => {
                        stream.destroy();
                        res.end();
                        reject(e);
                    });
                    stream.on('close', () => {
                        stream.destroy();
                        resolve(undefined);
                    });
                    stream.pipe(res);
                });
            }
        }
        else if (globalThis.Response && this.body instanceof Response /* Fetch Response */) {
            this.mergeStatus('ok');
            if (method === 'HEAD') {
                res.end();
            }
            else {
                await respondWithFetch(this.body.body, res);
            }
        }
        else {
            const renderedBody = this.renderer.render(this);
            this.mergeStatus(renderedBody);
            res.writeHead(this.status, {
                'content-length': Buffer.byteLength(renderedBody),
                ...this._headers,
            }).end(method !== 'HEAD' ? renderedBody : '');
        }
    }
}
exports.BaseWooksResponse = BaseWooksResponse;
async function respondWithFetch(fetchBody, res) {
    if (fetchBody) {
        try {
            for await (const chunk of fetchBody) {
                res.write(chunk);
            }
        }
        catch (e) {
            // ?
        }
    }
    res.end();
}
