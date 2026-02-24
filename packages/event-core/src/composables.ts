import { randomUUID } from 'node:crypto'
import { cached } from './key'
import { current } from './storage'
import { routeParamsKey } from './keys'
import type { EventContext } from './context'

const eventIdSlot = cached(() => randomUUID())

export function useRouteParams<
  T extends Record<string, string | string[]> = Record<string, string | string[]>,
>(ctx?: EventContext): { params: T; get: <K extends keyof T>(name: K) => T[K] } {
  const c = ctx ?? current()
  const params = c.get(routeParamsKey) as T
  return {
    params,
    get: <K extends keyof T>(name: K) => params[name],
  }
}

export function useEventId(ctx?: EventContext): { getId: () => string } {
  const c = ctx ?? current()
  return {
    getId: () => c.get(eventIdSlot),
  }
}
