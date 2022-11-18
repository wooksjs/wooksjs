"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWooksResponder = void 0;
const composables_1 = require("../composables");
const error_renderer_1 = require("../errors/error-renderer");
const wooks_error_1 = require("../errors/wooks-error");
const core_1 = require("./core");
const renderer_1 = require("./renderer");
function createWooksResponder(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
renderer = new renderer_1.BaseWooksResponseRenderer(), 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
errorRenderer = new error_renderer_1.WooksErrorRenderer()) {
    function createResponse(data) {
        const { hasResponded } = (0, composables_1.useResponse)();
        if (hasResponded())
            return null;
        if (data instanceof Error) {
            const r = new core_1.BaseWooksResponse(errorRenderer);
            let httpError;
            if (data instanceof wooks_error_1.WooksError) {
                httpError = data;
            }
            else {
                httpError = new wooks_error_1.WooksError(500, data.message);
            }
            r.setBody(httpError.body);
            return r;
        }
        else if (data instanceof core_1.BaseWooksResponse) {
            return data;
        }
        else {
            return new core_1.BaseWooksResponse(renderer).setBody(data);
        }
    }
    return {
        createResponse,
        respond: (data) => createResponse(data)?.respond(),
    };
}
exports.createWooksResponder = createWooksResponder;
