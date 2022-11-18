"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WooksURLSearchParams = void 0;
const url_1 = require("url");
class WooksURLSearchParams extends url_1.URLSearchParams {
    toJson() {
        const json = {};
        for (const [key, value] of this.entries()) {
            if (isArrayParam(key)) {
                const a = json[key] = (json[key] || []);
                a.push(value);
            }
            else {
                json[key] = value;
            }
        }
        return json;
    }
}
exports.WooksURLSearchParams = WooksURLSearchParams;
function isArrayParam(name) {
    return name.endsWith('[]');
}
