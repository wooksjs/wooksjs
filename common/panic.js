"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.panic = void 0;
const log_1 = require("./log");
function panic(error) {
    (0, log_1.logError)(error);
    return new Error(error);
}
exports.panic = panic;
