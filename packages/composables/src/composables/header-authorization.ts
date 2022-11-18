import { useHeaders } from './headers'
import { innerCacheSymbols } from '../core'
import { useCacheStore } from '../cache'

export type TAuthCache = {
    type: string
    credentials: string
    basicCredentials: { username: string, password: string }
}

export function useAuthorization() {
    const { authorization } = useHeaders()
    const { set, get, has } = useCacheStore<TAuthCache>(innerCacheSymbols.authorization)
    const authType = () => {
        if (authorization) {
            if (!has('type')) {
                const space = authorization.indexOf(' ')
                return set('type', authorization.slice(0, space))
            }
            return get('type')
        }
        return null
    }
    const authRawCredentials = () => {
        if (authorization) {
            if (!has('credentials')) {
                const space = authorization.indexOf(' ')
                return set('credentials', authorization.slice(space + 1))
            }
            return get('credentials')
        }
        return null
    }
    return {
        authorization,
        authType,
        authRawCredentials,
        isBasic: () => authType()?.toLocaleLowerCase() === 'basic',
        isBearer: () => authType()?.toLocaleLowerCase() === 'bearer',
        basicCredentials: () => {
            if (authorization) {
                if (!has('basicCredentials')) {
                    const type = authType()
                    if (type?.toLocaleLowerCase() === 'basic') {
                        const creds =Buffer.from(authRawCredentials() || '', 'base64').toString('ascii')
                        const [username, password] = creds.split(':')
                        return set('basicCredentials', { username, password })
                    }
                }
                return get('basicCredentials')
            }
            return null
        },
    }
}
