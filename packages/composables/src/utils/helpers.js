"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeDecodeURIComponent = exports.escapeRegex = void 0;
function escapeRegex(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}
exports.escapeRegex = escapeRegex;
function safeDecode(f, v) {
    try {
        return f(v);
    }
    catch (e) {
        return v;
    }
}
function safeDecodeURIComponent(uri) {
    if (uri.indexOf('%') < 0)
        return uri;
    return safeDecode(decodeURIComponent, uri);
}
exports.safeDecodeURIComponent = safeDecodeURIComponent;
