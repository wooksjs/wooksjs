"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSetHeader = exports.useSetHeaders = exports.useHeaders = void 0;
const cache_1 = require("../cache");
const core_1 = require("../core");
const hooks_1 = require("../hooks");
const request_1 = require("./request");
function useHeaders() {
    return (0, request_1.useRequest)().headers;
}
exports.useHeaders = useHeaders;
function useSetHeaders() {
    const { get, set, del, getAll } = (0, cache_1.useCacheStore)(core_1.innerCacheSymbols.setHeader);
    function setHeader(name, value) {
        set(name, value.toString());
    }
    function setContentType(value) {
        setHeader('content-type', value);
    }
    function enableCors(origin = '*') {
        setHeader('access-control-allow-origin', origin);
    }
    return {
        setHeader,
        getHeader: get,
        removeHeader: del,
        setContentType,
        headers: () => getAll(),
        enableCors,
    };
}
exports.useSetHeaders = useSetHeaders;
function useSetHeader(name) {
    const { setHeader, headers } = useSetHeaders();
    return (0, hooks_1.attachHook)({
        name,
        type: 'header',
    }, {
        get: () => headers()[name],
        set: (value) => setHeader(name, value),
    });
}
exports.useSetHeader = useSetHeader;
