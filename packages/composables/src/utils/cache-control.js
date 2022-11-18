"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCacheControl = void 0;
const panic_1 = require("common/panic");
const time_1 = require("./time");
function renderCacheControl(data) {
    let attrs = '';
    for (const [a, v] of Object.entries(data)) {
        if (typeof v === 'undefined')
            continue;
        const func = cacheControlFunc[a];
        if (typeof func === 'function') {
            const val = func(v);
            if (val) {
                attrs += attrs ? ', ' + val : val;
            }
        }
        else {
            (0, panic_1.panic)('Unknown Cache-Control attribute ' + a);
        }
    }
    return attrs;
}
exports.renderCacheControl = renderCacheControl;
// rfc7234#section-5.2.2
const cacheControlFunc = {
    mustRevalidate: (v) => v ? 'must-revalidate' : '',
    noCache: (v) => v ? (typeof v === 'string' ? `no-cache="${v}"` : 'no-cache') : '',
    noStore: (v) => v ? 'no-store' : '',
    noTransform: (v) => v ? 'no-transform' : '',
    public: (v) => v ? 'public' : '',
    private: (v) => v ? (typeof v === 'string' ? `private="${v}"` : 'private') : '',
    proxyRevalidate: (v) => v ? 'proxy-revalidate' : '',
    maxAge: (v) => 'max-age=' + (0, time_1.convertTime)(v, 's').toString(),
    sMaxage: (v) => 's-maxage=' + (0, time_1.convertTime)(v, 's').toString(),
};
