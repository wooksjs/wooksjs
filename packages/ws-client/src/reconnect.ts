import type { WsClientReconnectOptions } from './types'

export interface ReconnectConfig {
  enabled: boolean
  maxRetries: number
  baseDelay: number
  maxDelay: number
  backoff: 'linear' | 'exponential'
}

/** Normalize the user-facing reconnect option into a full config. */
export function normalizeReconnectConfig(
  opt: boolean | WsClientReconnectOptions | undefined,
): ReconnectConfig {
  if (opt === true) {
    return {
      enabled: true,
      maxRetries: Infinity,
      baseDelay: 1000,
      maxDelay: 30_000,
      backoff: 'exponential',
    }
  }
  if (opt === false || opt === undefined) {
    return {
      enabled: false,
      maxRetries: 0,
      baseDelay: 1000,
      maxDelay: 30_000,
      backoff: 'exponential',
    }
  }
  return {
    enabled: opt.enabled,
    maxRetries: opt.maxRetries ?? Infinity,
    baseDelay: opt.baseDelay ?? 1000,
    maxDelay: opt.maxDelay ?? 30_000,
    backoff: opt.backoff ?? 'exponential',
  }
}

/** Manages reconnection state and backoff calculation. */
export class ReconnectController {
  private attempt = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private stopped = false

  constructor(private readonly config: ReconnectConfig) {}

  /** Whether reconnect is enabled and not manually stopped. */
  get enabled(): boolean {
    return this.config.enabled && !this.stopped
  }

  /** Current attempt number. */
  get currentAttempt(): number {
    return this.attempt
  }

  /** Schedule a reconnection attempt. Returns false if max retries exceeded or stopped. */
  schedule(onReconnect: () => void): boolean {
    if (this.stopped) {
      return false
    }
    if (this.attempt >= this.config.maxRetries) {
      return false
    }

    const delay = this.getDelay()
    this.attempt++
    this.timer = setTimeout(onReconnect, delay)
    return true
  }

  /** Reset attempt counter (called on successful connection). */
  reset(): void {
    this.attempt = 0
    this.cancelPending()
  }

  /** Permanently stop reconnection (called on explicit close()). */
  stop(): void {
    this.stopped = true
    this.cancelPending()
  }

  private getDelay(): number {
    const { baseDelay, maxDelay, backoff } = this.config
    const delay =
      backoff === 'exponential' ? baseDelay * 2 ** this.attempt : baseDelay * (this.attempt + 1)
    return Math.min(delay, maxDelay)
  }

  private cancelPending(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
  }
}
