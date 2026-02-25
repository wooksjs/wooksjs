import type { WsReplyMessage } from './types'
import { WsClientError } from './ws-client-error'

interface PendingRpc {
  resolve: (data: unknown) => void
  reject: (error: WsClientError) => void
  timer: ReturnType<typeof setTimeout>
}

/** Tracks pending RPC calls by correlation ID. */
export class RpcTracker {
  private nextId = 1
  private readonly pending = new Map<number, PendingRpc>()

  /** Generate a new unique message ID. */
  generateId(): number {
    return this.nextId++
  }

  /** Track a new pending RPC. Returns a promise that resolves/rejects based on the reply. */
  track(id: number, timeout: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new WsClientError(408, 'RPC timeout'))
      }, timeout)

      this.pending.set(id, { resolve, reject, timer })
    })
  }

  /** Resolve a pending RPC with a server reply. Returns true if an RPC was found. */
  resolve(reply: WsReplyMessage): boolean {
    const id = typeof reply.id === 'number' ? reply.id : Number(reply.id)
    const entry = this.pending.get(id)
    if (!entry) {
      return false
    }

    clearTimeout(entry.timer)
    this.pending.delete(id)

    if (reply.error) {
      entry.reject(new WsClientError(reply.error.code, reply.error.message))
    } else {
      entry.resolve(reply.data)
    }
    return true
  }

  /** Reject all pending RPCs (on disconnect or close). */
  rejectAll(code: number, message: string): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(new WsClientError(code, message))
    }
    this.pending.clear()
  }

  /** Number of pending RPCs. */
  get size(): number {
    return this.pending.size
  }
}
