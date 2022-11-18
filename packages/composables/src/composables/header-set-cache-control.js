"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSetCacheControl = void 0;
const time_1 = require("../utils/time");
const cache_control_1 = require("../utils/cache-control");
const headers_1 = require("./headers");
const renderAge = (v) => (0, time_1.convertTime)(v, 's').toString();
const renderExpires = (v) => (typeof v === 'string' || typeof v === 'number' ? new Date(v).toUTCString() : v.toUTCString());
const renderPragmaNoCache = (v) => v ? 'no-cache' : '';
// rfc7234#section-5.2.2
function useSetCacheControl() {
    const { setHeader } = (0, headers_1.useSetHeaders)();
    const setAge = (value) => {
        setHeader('age', renderAge(value));
    };
    const setExpires = (value) => {
        setHeader('expires', renderExpires(value));
    };
    const setPragmaNoCache = (value = true) => {
        setHeader('pragma', renderPragmaNoCache(value));
    };
    const setCacheControl = (data) => {
        setHeader('cache-control', (0, cache_control_1.renderCacheControl)(data));
    };
    return {
        setExpires,
        setAge,
        setPragmaNoCache,
        setCacheControl,
    };
}
exports.useSetCacheControl = useSetCacheControl;
