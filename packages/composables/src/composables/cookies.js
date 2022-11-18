"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSetCookie = exports.useSetCookies = exports.useCookies = void 0;
const headers_1 = require("./headers");
const core_1 = require("../core");
const set_cookie_1 = require("../utils/set-cookie");
const helpers_1 = require("../utils/helpers");
const cache_1 = require("../cache");
const hooks_1 = require("../hooks");
function useCookies() {
    const { get, set, has } = (0, cache_1.useCacheStore)(core_1.innerCacheSymbols.cookies);
    const { cookie } = (0, headers_1.useHeaders)();
    function getCookie(name) {
        if (!has(name)) {
            if (cookie) {
                const result = new RegExp(`(?:^|; )${(0, helpers_1.escapeRegex)(name)}=(.*?)(?:;?$|; )`, 'i').exec(cookie);
                return set(name, result && result[1] ? (0, helpers_1.safeDecodeURIComponent)(result[1]) : null);
            }
            else {
                return set(name, null);
            }
        }
        return get(name);
    }
    return {
        rawCookies: cookie,
        getCookie,
    };
}
exports.useCookies = useCookies;
function useSetCookies() {
    const { clear, get, set, entries, del } = (0, cache_1.useCacheStore)(core_1.innerCacheSymbols.setCookies);
    function setCookie(name, value, attrs) {
        set(name, {
            value,
            attrs: attrs || {},
        });
    }
    function cookies() {
        return entries().filter(a => !!a[1]).map(([key, value]) => (0, set_cookie_1.renderCookie)(key, value));
    }
    return {
        setCookie,
        getCookie: get,
        removeCookie: del,
        clearCookies: clear,
        cookies,
    };
}
exports.useSetCookies = useSetCookies;
function useSetCookie(name) {
    const { setCookie, getCookie } = useSetCookies();
    const valueHook = (0, hooks_1.attachHook)({
        name,
        type: 'cookie',
    }, {
        get: () => getCookie(name)?.value,
        set: (value) => setCookie(name, value, getCookie(name)?.attrs),
    });
    return (0, hooks_1.attachHook)(valueHook, {
        get: () => getCookie(name)?.attrs,
        set: (attrs) => setCookie(name, getCookie(name)?.value || '', attrs),
    }, 'attrs');
}
exports.useSetCookie = useSetCookie;
