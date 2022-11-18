"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.innerCacheSymbols = exports.useWooksCtx = exports.createWooksCtx = void 0;
const panic_1 = require("common/panic");
let currentContext = null;
function createWooksCtx(ctx) {
    const newContext = {
        req: ctx.req,
        res: ctx.res,
        params: ctx.params || {},
        cache: ctx.cache || {},
    };
    // for compatibility with express use getter
    Object.defineProperty(newContext, 'params', {
        get: () => ctx.params || ctx.req.params || {},
    });
    currentContext = newContext;
    return getCtxHelpers(newContext);
}
exports.createWooksCtx = createWooksCtx;
function getCtxHelpers(cc) {
    return {
        getCtx: () => cc,
        restoreCtx: () => currentContext = cc,
        clearCtx: () => currentContext = null,
        replaceParams: (newParams) => cc.params = newParams,
    };
}
function useWooksCtx() {
    if (!currentContext) {
        throw (0, panic_1.panic)('Use HTTP hooks only synchronously within the runtime of the request.');
    }
    const cc = currentContext;
    return getCtxHelpers(cc);
}
exports.useWooksCtx = useWooksCtx;
exports.innerCacheSymbols = {
    searchParams: Symbol('searchParams'),
    cookies: Symbol('cookies'),
    accept: Symbol('accept'),
    authorization: Symbol('authorization'),
    setHeader: Symbol('setHeader'),
    setCookies: Symbol('setCookies'),
    status: Symbol('status'),
    response: Symbol('response'),
    request: Symbol('request'),
};
