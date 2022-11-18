"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logError = exports.warn = exports.logBright = exports.log = void 0;
/* istanbul ignore file */
const banner_1 = require("./banner");
function log(text) {
    console.log(__DYE_GREEN__ + __DYE_DIM__ + (0, banner_1.banner)() + text + __DYE_RESET__);
}
exports.log = log;
function logBright(text) {
    console.log(__DYE_GREEN__ + (0, banner_1.banner)() + text + __DYE_RESET__);
}
exports.logBright = logBright;
function warn(text) {
    console.warn(__DYE_YELLOW__ + (0, banner_1.banner)() + text + __DYE_RESET__);
}
exports.warn = warn;
function logError(error) {
    console.error(__DYE_RED_BRIGHT__ + __DYE_BOLD__ + (0, banner_1.banner)() + error + __DYE_RESET__);
}
exports.logError = logError;
