"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSearchParams = void 0;
const request_1 = require("./request");
const core_1 = require("../core");
const url_search_params_1 = require("../utils/url-search-params");
const cache_1 = require("../cache");
function useSearchParams() {
    const url = (0, request_1.useRequest)().url || '';
    const { get, set, has } = (0, cache_1.useCacheStore)(core_1.innerCacheSymbols.searchParams);
    function rawSearchParams() {
        if (!has('raw')) {
            const i = url.indexOf('?');
            return set('raw', i >= 0 ? url.slice(i) : '');
        }
        return get('raw') || '';
    }
    function urlSearchParams() {
        if (!has('urlSearchParams')) {
            return set('urlSearchParams', new url_search_params_1.WooksURLSearchParams(rawSearchParams()));
        }
        return get('urlSearchParams');
    }
    return {
        rawSearchParams,
        urlSearchParams,
        jsonSearchParams: () => urlSearchParams().toJson(),
    };
}
exports.useSearchParams = useSearchParams;
