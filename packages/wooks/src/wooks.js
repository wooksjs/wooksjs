"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Wooks = void 0;
const router_1 = require("@prostojs/router");
const composables_1 = require("@wooksjs/composables");
const http_1 = require("./http");
const banner_1 = require("common/banner");
const panic_1 = require("common/panic");
class Wooks {
    options;
    router;
    server;
    responder = (0, composables_1.createWooksResponder)();
    _uncoughtExceptionHandler;
    constructor(options) {
        this.options = options;
        this.router = new router_1.ProstoRouter();
        if (!true) {
            console.log(this.options);
        }
        this._uncoughtExceptionHandler = ((err) => {
            this.printError('Uncought exception: ', err);
        }).bind(this);
    }
    getRouter() {
        return this.router;
    }
    listen(port, hostname, cb) {
        return new Promise((resolve, reject) => {
            const myCb = () => {
                const fn = typeof hostname === 'function' ? hostname : cb;
                process.on('uncaughtException', this._uncoughtExceptionHandler);
                if (fn) {
                    fn();
                }
                this.server?.off('error', reject);
                resolve();
            };
            try {
                this.server = (0, http_1.createServer)({
                    port,
                }, this.processRequest.bind(this), typeof hostname === 'string' ? hostname : '', myCb);
                this.server?.on('error', reject);
            }
            catch (e) {
                reject(e);
            }
        });
    }
    close() {
        return new Promise((resolve, reject) => {
            this.server?.close((err) => {
                if (err)
                    return reject(err);
                process.off('uncaughtException', this._uncoughtExceptionHandler);
                resolve(this.server);
            });
        });
    }
    processRequest(req, res) {
        const found = this.router.lookup(req.method, req.url);
        const params = found?.ctx?.params || {};
        const { restoreCtx, clearCtx } = (0, composables_1.createWooksCtx)({ req, res, params });
        if (found) {
            this.processHandlers(req, res, found)
                // .then(() => {
                //     console.log('ok')
                // })
                .catch((e) => {
                this.printError('Internal error, please report: ', e);
                restoreCtx();
                this.respond(e);
                clearCtx();
                console.error(__DYE_RED_BRIGHT__ + __DYE_BOLD__ + (0, banner_1.banner)(), e, __DYE_RESET__);
            });
            // .finally(() => {
            //     console.log('done')
            // })
        }
        else {
            // not found
            this.respond(new composables_1.WooksError(404));
            clearCtx();
        }
    }
    async processHandlers(req, res, found) {
        const { restoreCtx, clearCtx } = (0, composables_1.useWooksCtx)();
        for (const [i, handler] of found.route.handlers.entries()) {
            const isLastHandler = found.route.handlers.length === i + 1;
            try {
                restoreCtx();
                const promise = handler();
                clearCtx();
                const result = await promise;
                // even if the returned value is an Error instance
                // we still want to process it as a response
                restoreCtx();
                this.respond(result);
                clearCtx();
                break;
            }
            catch (e) {
                this.printError('Uncought route handler exception: ' + (req.url || '') + '\n', e);
                if (isLastHandler) {
                    restoreCtx();
                    this.respond(e);
                    clearCtx();
                }
            }
        }
    }
    printError(expl, e) {
        if (!(e instanceof composables_1.WooksError)) {
            (0, panic_1.panic)(expl + e.message);
            console.error(__DYE_RED__ + (e.stack || '') + __DYE_COLOR_OFF__);
        }
    }
    respond(data) {
        void this.responder.respond(data)?.catch((e) => {
            this.printError('Uncought response exception:\n', e);
        });
    }
    get(path, handler) {
        this.router.on('HEAD', path, handler);
        return this.router.on('GET', path, handler);
    }
    post(path, handler) {
        return this.router.on('POST', path, handler);
    }
    put(path, handler) {
        return this.router.on('PUT', path, handler);
    }
    delete(path, handler) {
        return this.router.on('DELETE', path, handler);
    }
    patch(path, handler) {
        return this.router.on('PATCH', path, handler);
    }
    on(method, path, handler) {
        return this.router.on(method, path, handler);
    }
}
exports.Wooks = Wooks;
