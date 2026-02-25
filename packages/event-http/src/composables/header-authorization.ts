import { cached, cachedBy, defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'
import { Buffer } from 'buffer'

import { httpKind } from '../http-kind'

/** Short names for common Authorization schemes. */
export type KnownAuthType = 'basic' | 'bearer'

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

const authIsSlot = cachedBy((type: string, ctx: EventContext) => {
  const authType = ctx.get(authTypeSlot)
  return authType?.toLowerCase() === type.toLowerCase()
})

/**
 * Provides parsed access to the Authorization header (type, credentials, Basic decoding).
 * @example
 * ```ts
 * const { is, credentials, basicCredentials } = useAuthorization()
 * if (is('bearer')) { const token = credentials() }
 * ```
 */
export const useAuthorization = defineWook((ctx: EventContext) => {
  const authorization = ctx.get(httpKind.keys.req).headers.authorization
  return {
    authorization,
    type: () => ctx.get(authTypeSlot),
    credentials: () => ctx.get(authCredentialsSlot),
    is: (type: KnownAuthType | (string & {})) => authIsSlot(type, ctx),
    basicCredentials: () => ctx.get(basicCredentialsSlot),
  }
})
