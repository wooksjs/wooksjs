"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useCacheStore = void 0;
const core_1 = require("./core");
function useCacheStore(name) {
    const ctxCache = (0, core_1.useWooksCtx)().getCtx().cache;
    ctxCache[name] = (ctxCache[name] || {});
    const getAll = () => ctxCache[name];
    const get = (propName) => getAll()[propName];
    const has = (propName) => typeof getAll()[propName] !== 'undefined';
    const set = (propName, v) => getAll()[propName] = v;
    const del = (propName) => getAll()[propName] = undefined;
    const clear = () => ctxCache[name] = {};
    const entries = () => Object.entries(getAll());
    return {
        get,
        getAll,
        has,
        set,
        del,
        clear,
        entries,
    };
}
exports.useCacheStore = useCacheStore;
