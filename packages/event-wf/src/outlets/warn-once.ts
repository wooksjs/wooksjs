import { useLogger } from '@wooksjs/event-core'

const warned = new Set<string>()

/** Distinct keys remembered at most — beyond that, further warnings are dropped. */
const MAX_KEYS = 256

/**
 * Log `message` once per `key` (a fixed category, optionally plus a list
 * entry). Trigger configs are often rebuilt per request, so warnings about
 * them must not repeat — and the set of keys must stay bounded.
 */
export function warnOnce(key: string, message: string) {
  if (warned.has(key) || warned.size >= MAX_KEYS) {
    return
  }
  warned.add(key)
  useLogger('wf-outlet').warn(message)
}
