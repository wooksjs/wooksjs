"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertTime = void 0;
function convertTime(time, unit = 'ms') {
    if (typeof time === 'number')
        return time / units[unit];
    const rg = /(\d+)(\w+)/g;
    let t = 0;
    let r;
    while (r = rg.exec(time)) {
        t += Number(r[1]) * (units[r[2]] || 0);
    }
    return t / units[unit];
}
exports.convertTime = convertTime;
const units = {
    ms: 1,
    s: 1000,
    m: 1000 * 60,
    h: 1000 * 60 * 60,
    d: 1000 * 60 * 60 * 24,
    w: 1000 * 60 * 60 * 24 * 7,
    M: 1000 * 60 * 60 * 24 * 30,
    Y: 1000 * 60 * 60 * 24 * 365,
};
