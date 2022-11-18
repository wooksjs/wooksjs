"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCookie = void 0;
const panic_1 = require("common/panic");
const time_1 = require("./time");
function renderCookie(key, data) {
    let attrs = '';
    for (const [a, v] of Object.entries(data.attrs)) {
        const func = cookieAttrFunc[a];
        if (typeof func === 'function') {
            const val = func(v);
            attrs += val ? '; ' + val : '';
        }
        else {
            (0, panic_1.panic)('Unknown Set-Cookie attribute ' + a);
        }
    }
    return `${key}=${encodeURIComponent(data.value)}${attrs}`;
}
exports.renderCookie = renderCookie;
const cookieAttrFunc = {
    expires: (v) => 'Expires=' + (typeof v === 'string' || typeof v === 'number' ? new Date(v).toUTCString() : v.toUTCString()),
    maxAge: (v) => 'Max-Age=' + (0, time_1.convertTime)(v, 's').toString(),
    domain: (v) => 'Domain=' + v,
    path: (v) => 'Path=' + v,
    secure: (v) => v ? 'Secure' : '',
    httpOnly: (v) => v ? 'HttpOnly' : '',
    sameSite: (v) => v ? 'SameSite=' + (typeof v === 'string' ? v : 'Strict') : '',
};
