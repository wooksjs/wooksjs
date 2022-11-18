"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WooksError = void 0;
const status_codes_1 = require("../utils/status-codes");
class WooksError extends Error {
    code;
    _body;
    constructor(code = 500, _body = '') {
        super(typeof _body === 'string' ? _body : _body.message);
        this.code = code;
        this._body = _body;
    }
    get body() {
        return typeof this._body === 'string' ? {
            statusCode: this.code,
            message: this.message,
            error: status_codes_1.httpStatusCodes[this.code],
        } : {
            ...this._body,
            statusCode: this.code,
            message: this.message,
            error: status_codes_1.httpStatusCodes[this.code],
        };
    }
    renderer;
    attachRenderer(renderer) {
        this.renderer = renderer;
    }
    getRenderer() {
        return this.renderer;
    }
}
exports.WooksError = WooksError;
