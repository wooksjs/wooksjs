"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WooksErrorRenderer = void 0;
const composables_1 = require("../composables");
const status_codes_1 = require("../utils/status-codes");
const renderer_1 = require("../response/renderer");
const preStyles = 'font-family: monospace;'
    + 'width: 100%;'
    + 'max-width: 900px;'
    + 'padding: 10px;'
    + 'margin: 20px auto;'
    + 'border-radius: 8px;'
    + 'background-color: #494949;'
    + 'box-shadow: 0px 0px 3px 2px rgb(255 255 255 / 20%);';
class WooksErrorRenderer extends renderer_1.BaseWooksResponseRenderer {
    renderHtml(response) {
        const data = response.body || {};
        response.setContentType('text/html');
        const keys = Object.keys(data).filter(key => !['statusCode', 'error', 'message'].includes(key));
        return '<html style="background-color: #333; color: #bbb;">' +
            `<head><title>${data.statusCode} ${status_codes_1.httpStatusCodes[data.statusCode]}</title></head>` +
            `<body><center><h1>${data.statusCode} ${status_codes_1.httpStatusCodes[data.statusCode]}</h1></center>` +
            `<center><h4>${data.message}</h1></center><hr color="#666">` +
            `<center style="color: #666;"> Wooks v${__VERSION__} </center>` +
            `${keys.length ? `<pre style="${preStyles}">${JSON.stringify({ ...data, statusCode: undefined, message: undefined, error: undefined }, null, '  ')}</pre>` : ''}` +
            '</body></html>';
    }
    renderText(response) {
        const data = response.body || {};
        response.setContentType('text/plain');
        const keys = Object.keys(data).filter(key => !['statusCode', 'error', 'message'].includes(key));
        return `${data.statusCode} ${status_codes_1.httpStatusCodes[data.statusCode]}\n${data.message}`
            + `\n\n${keys.length ? `${JSON.stringify({ ...data, statusCode: undefined, message: undefined, error: undefined }, null, '  ')}` : ''}`;
    }
    renderJson(response) {
        const data = response.body || {};
        response.setContentType('application/json');
        const keys = Object.keys(data).filter(key => !['statusCode', 'error', 'message'].includes(key));
        return `{"statusCode":${escapeQuotes(data.statusCode)},`
            + `"error":"${escapeQuotes(data.error)}",`
            + `"message":"${escapeQuotes(data.message)}"`
            + `${keys.length ? (',' + keys.map(k => `"${escapeQuotes(k)}":${JSON.stringify(data[k])}`).join(',')) : ''}}`;
    }
    render(response) {
        const { acceptsJson, acceptsText, acceptsHtml } = (0, composables_1.useAccept)();
        response.status = response.body?.statusCode || 500;
        if (acceptsJson()) {
            return this.renderJson(response);
        }
        else if (acceptsHtml()) {
            return this.renderHtml(response);
        }
        else if (acceptsText()) {
            return this.renderText(response);
        }
        else {
            return this.renderJson(response);
        }
    }
}
exports.WooksErrorRenderer = WooksErrorRenderer;
function escapeQuotes(s) {
    return (typeof s === 'number' ? s : (s || '')).toString().replace(/[\""]/g, '\\"');
}
