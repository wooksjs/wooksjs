"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAccept = void 0;
const headers_1 = require("./headers");
const core_1 = require("../core");
const cache_1 = require("../cache");
function useAccept() {
    const { accept } = (0, headers_1.useHeaders)();
    const { get, set, has } = (0, cache_1.useCacheStore)(core_1.innerCacheSymbols.accept);
    const accepts = (mime) => {
        if (!has(mime)) {
            return set(mime, !!(accept && (accept === '*/*' || accept.indexOf(mime) >= 0)));
        }
        return get(mime);
    };
    return {
        accept,
        accepts,
        acceptsJson: () => accepts('application/json'),
        acceptsXml: () => accepts('application/xml'),
        acceptsText: () => accepts('text/plain'),
        acceptsHtml: () => accepts('text/html'),
    };
}
exports.useAccept = useAccept;
