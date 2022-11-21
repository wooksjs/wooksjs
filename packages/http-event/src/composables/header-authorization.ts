import { useHeaders } from './headers'
import { useHttpContext } from '../http-event'

export function useAuthorization() {
    const { store } = useHttpContext()
    const { authorization } = useHeaders()
    const { hook } = store('authorization')

    const authType = () => {
        const type = hook('type')
        if (authorization) {
            if (!type.isDefined) {
                const space = authorization.indexOf(' ')
                return type.value = authorization.slice(0, space)
            }
            return type.value
        }
        return null
    }
    const authRawCredentials = () => {
        const credentials = hook('credentials')
        if (authorization) {
            if (!credentials.isDefined) {
                const space = authorization.indexOf(' ')
                return credentials.value = authorization.slice(space + 1)
            }
            return credentials.value
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
                const basicCredentials = hook('basicCredentials')
                if (!basicCredentials.isDefined) {
                    const type = authType()
                    if (type?.toLocaleLowerCase() === 'basic') {
                        const creds = Buffer.from(authRawCredentials() || '', 'base64').toString('ascii')
                        const [username, password] = creds.split(':')
                        return basicCredentials.value = { username, password }
                    }
                }
                return basicCredentials.value
            }
            return null
        },
    }
}
