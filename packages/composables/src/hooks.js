"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachHook = void 0;
// eslint-disable-next-line @typescript-eslint/ban-types
function attachHook(target, opts, name) {
    Object.defineProperty(target, name || 'value', {
        get: opts.get,
        set: opts.set,
    });
    return target;
}
exports.attachHook = attachHook;
