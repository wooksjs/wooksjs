import { cached, defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'
import { Buffer } from 'buffer'

import { httpKind } from '../http-kind'

const authTypeSlot = cached((ctx: EventContext) => {
  const authorization = ctx.get(httpKind.keys.req).headers.authorization
  if (authorization) {
    const space = authorization.indexOf(' ')
    return authorization.slice(0, space)
  }
  return null
})

const authCredentialsSlot = cached((ctx: EventContext) => {
  const authorization = ctx.get(httpKind.keys.req).headers.authorization
  if (authorization) {
    const space = authorization.indexOf(' ')
    return authorization.slice(space + 1)
  }
  return null
})

const basicCredentialsSlot = cached((ctx: EventContext) => {
  const authorization = ctx.get(httpKind.keys.req).headers.authorization
  if (authorization) {
    const type = ctx.get(authTypeSlot)
    if (type?.toLocaleLowerCase() === 'basic') {
      const creds = Buffer.from(ctx.get(authCredentialsSlot) || '', 'base64').toString('ascii')
      const [username, password] = creds.split(':')
      return { username, password }
    }
  }
  return null
})

/**
 * Provides parsed access to the Authorization header (type, credentials, Basic decoding).
 * @example
 * ```ts
 * const { isBearer, authRawCredentials, basicCredentials } = useAuthorization()
 * if (isBearer()) { const token = authRawCredentials() }
 * ```
 */
export const useAuthorization = defineWook((ctx: EventContext) => {
  const authorization = ctx.get(httpKind.keys.req).headers.authorization
  return {
    authorization,
    authType: () => ctx.get(authTypeSlot),
    authRawCredentials: () => ctx.get(authCredentialsSlot),
    isBasic: () => ctx.get(authTypeSlot)?.toLocaleLowerCase() === 'basic',
    isBearer: () => ctx.get(authTypeSlot)?.toLocaleLowerCase() === 'bearer',
    basicCredentials: () => ctx.get(basicCredentialsSlot),
  }
})
