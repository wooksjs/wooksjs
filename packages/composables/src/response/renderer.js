"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseWooksResponseRenderer = void 0;
const panic_1 = require("common/panic");
class BaseWooksResponseRenderer {
    render(response) {
        if (typeof response.body === 'string' || typeof response.body === 'boolean' || typeof response.body === 'number') {
            if (!response.getContentType())
                response.setContentType('text/plain');
            return response.body.toString();
        }
        if (typeof response.body === 'undefined') {
            return '';
        }
        if (response.body instanceof Uint8Array) {
            return response.body;
        }
        if (typeof response.body === 'object') {
            if (!response.getContentType())
                response.setContentType('application/json');
            return JSON.stringify(response.body);
        }
        throw (0, panic_1.panic)('Unsupported body format "' + typeof response.body + '"');
    }
}
exports.BaseWooksResponseRenderer = BaseWooksResponseRenderer;
