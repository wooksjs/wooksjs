"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = void 0;
const http_1 = __importDefault(require("http"));
function createServer(opts, cb, hostname, onListen) {
    const server = http_1.default.createServer(cb);
    if (hostname) {
        server.listen(opts.port, hostname, onListen);
    }
    else {
        server.listen(opts.port, onListen);
    }
    return server;
}
exports.createServer = createServer;
