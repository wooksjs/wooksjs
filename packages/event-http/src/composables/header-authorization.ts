import { Buffer } from 'buffer'

import { useHttpContext } from '../event-http'
import { useHeaders } from './headers'

export function useAuthorization() {
  const { store } = useHttpContext()
  const { authorization } = useHeaders()
  const { init } = store('authorization')

  const authType = () =>
    init('type', () => {
      if (authorization) {
        const space = authorization.indexOf(' ')
        return authorization.slice(0, space)
      }
      return null
    })

  const authRawCredentials = () =>
    init('credentials', () => {
      if (authorization) {
        const space = authorization.indexOf(' ')
        return authorization.slice(space + 1)
      }
      return null
    })

  return {
    authorization,
    authType,
    authRawCredentials,
    isBasic: () => authType()?.toLocaleLowerCase() === 'basic',
    isBearer: () => authType()?.toLocaleLowerCase() === 'bearer',
    basicCredentials: () =>
      init('basicCredentials', () => {
        if (authorization) {
          const type = authType()
          if (type?.toLocaleLowerCase() === 'basic') {
            const creds = Buffer.from(authRawCredentials() || '', 'base64').toString('ascii')
            const [username, password] = creds.split(':')
            return { username, password }
          }
        }
        return null
      }),
  }
}
