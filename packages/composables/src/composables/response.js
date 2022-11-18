"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useStatus = exports.useResponse = void 0;
const core_1 = require("../core");
const cache_1 = require("../cache");
const hooks_1 = require("../hooks");
function useResponse() {
    const respHandle = (0, cache_1.useCacheStore)(core_1.innerCacheSymbols.response);
    const { res } = (0, core_1.useWooksCtx)().getCtx();
    const statusHandle = (0, cache_1.useCacheStore)(core_1.innerCacheSymbols.status);
    function status(code) {
        if (code) {
            return statusHandle.set('code', code);
        }
        return statusHandle.get('code');
    }
    const rawResponse = (options) => {
        if (!options || !options.passthrough)
            respHandle.set('responded', true);
        return res;
    };
    return {
        rawResponse,
        hasResponded: () => respHandle.get('responded') || !res.writable || res.writableEnded,
        status: (0, hooks_1.attachHook)(status, {
            get: () => status(),
            set: (code) => status(code),
        }),
    };
}
exports.useResponse = useResponse;
function useStatus() {
    return useResponse().status;
}
exports.useStatus = useStatus;
