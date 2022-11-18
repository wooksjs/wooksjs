"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAuthorization = void 0;
const headers_1 = require("./headers");
const core_1 = require("../core");
const cache_1 = require("../cache");
function useAuthorization() {
    const { authorization } = (0, headers_1.useHeaders)();
    const { set, get, has } = (0, cache_1.useCacheStore)(core_1.innerCacheSymbols.authorization);
    const authType = () => {
        if (authorization) {
            if (!has('type')) {
                const space = authorization.indexOf(' ');
                return set('type', authorization.slice(0, space));
            }
            return get('type');
        }
        return null;
    };
    const authRawCredentials = () => {
        if (authorization) {
            if (!has('credentials')) {
                const space = authorization.indexOf(' ');
                return set('credentials', authorization.slice(space + 1));
            }
            return get('credentials');
        }
        return null;
    };
    return {
        authorization,
        authType,
        authRawCredentials,
        isBasic: () => authType()?.toLocaleLowerCase() === 'basic',
        isBearer: () => authType()?.toLocaleLowerCase() === 'bearer',
        basicCredentials: () => {
            if (authorization) {
                if (!has('basicCredentials')) {
                    const type = authType();
                    if (type?.toLocaleLowerCase() === 'basic') {
                        const creds = Buffer.from(authRawCredentials() || '', 'base64').toString('ascii');
                        const [username, password] = creds.split(':');
                        return set('basicCredentials', { username, password });
                    }
                }
                return get('basicCredentials');
            }
            return null;
        },
    };
}
exports.useAuthorization = useAuthorization;
