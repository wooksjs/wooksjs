/** Queue for outbound messages that accumulate while disconnected. */
export class MessageQueue {
  private readonly queue: string[] = []

  /** Enqueue a serialized message. */
  enqueue(serialized: string): void {
    this.queue.push(serialized)
  }

  /** Flush all queued messages via the provided send function. Returns number flushed. */
  flush(send: (data: string) => void): number {
    const count = this.queue.length
    for (const msg of this.queue) {
      send(msg)
    }
    this.queue.length = 0
    return count
  }

  /** Discard all queued messages. */
  clear(): void {
    this.queue.length = 0
  }

  /** Number of queued messages. */
  get size(): number {
    return this.queue.length
  }
}
