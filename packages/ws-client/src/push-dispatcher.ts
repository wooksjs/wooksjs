import type { WsClientPushEvent, WsPushHandler, WsPushMessage } from './types'

interface WildcardListener {
  event: string
  prefix: string
  handler: WsPushHandler
}

/** Dispatches server push messages to registered client-side listeners. */
export class PushDispatcher {
  /** Exact match: key = "event:path", value = set of handlers. */
  private readonly exact = new Map<string, Set<WsPushHandler>>()
  /** Wildcard listeners (path ends with "*"). */
  private readonly wildcards: WildcardListener[] = []

  /**
   * Register a push listener. Returns an unregister function.
   *
   * - Exact path: `"/chat/rooms/lobby"` — O(1) Map lookup.
   * - Wildcard: `"/chat/rooms/*"` — `startsWith` prefix check.
   */
  on<T = unknown>(event: string, pathPattern: string, handler: WsPushHandler<T>): () => void {
    const h = handler as WsPushHandler

    if (pathPattern.endsWith('*')) {
      const prefix = pathPattern.slice(0, -1)
      const entry: WildcardListener = { event, prefix, handler: h }
      this.wildcards.push(entry)

      return () => {
        const idx = this.wildcards.indexOf(entry)
        if (idx !== -1) {
          this.wildcards.splice(idx, 1)
        }
      }
    }

    const key = `${event}:${pathPattern}`
    let set = this.exact.get(key)
    if (!set) {
      set = new Set()
      this.exact.set(key, set)
    }
    set.add(h)

    return () => {
      set!.delete(h)
      if (set!.size === 0) {
        this.exact.delete(key)
      }
    }
  }

  /** Dispatch a server push message to matching listeners. */
  dispatch(msg: WsPushMessage): void {
    const pushEvent: WsClientPushEvent = {
      event: msg.event,
      path: msg.path,
      params: msg.params ?? {},
      data: msg.data,
    }

    // 1. Exact match (O(1))
    const key = `${msg.event}:${msg.path}`
    const exactSet = this.exact.get(key)
    if (exactSet) {
      for (const handler of exactSet) {
        handler(pushEvent)
      }
    }

    // 2. Wildcard match (linear scan — expected to be small)
    for (const { event, prefix, handler } of this.wildcards) {
      if (msg.event === event && msg.path.startsWith(prefix)) {
        handler(pushEvent)
      }
    }
  }

  /** Remove all listeners. */
  clear(): void {
    this.exact.clear()
    this.wildcards.length = 0
  }
}
