import { EventContext, routeParamsKey, run } from '@wooksjs/event-core'

import { wsConnectionKind, wsMessageKind } from './ws-kind'
import type { WsSocket } from './types'

/** Options for creating a test WS connection context. */
export interface TTestWsConnectionContext {
  /** Connection ID. Default: 'test-conn-id'. */
  id?: string
  /** Pre-set route parameters. */
  params?: Record<string, string | string[]>
  /** Optional parent context (e.g., an HTTP context for testing composable reuse). */
  parentCtx?: EventContext
}

/** Options for creating a test WS message context (includes connection context). */
export interface TTestWsMessageContext extends TTestWsConnectionContext {
  /** Message event type. */
  event: string
  /** Message path. */
  path: string
  /** Message data. */
  data?: unknown
  /** Message correlation ID. */
  messageId?: string | number
  /** Raw message. */
  rawMessage?: Buffer | string
}

/** Creates a mock WsSocket for testing. */
function createMockWsSocket(): WsSocket {
  return {
    send: () => {},
    close: () => {},
    on: () => {},
    ping: () => {},
    readyState: 1,
  }
}

/**
 * Creates a fully initialized WS connection context for testing.
 * Returns a runner function that executes callbacks inside the context scope.
 */
export function prepareTestWsConnectionContext(options?: TTestWsConnectionContext) {
  const id = options?.id ?? 'test-conn-id'
  const ws = createMockWsSocket()

  const ctx = new EventContext({
    logger: console as any,
    ...(options?.parentCtx ? { parent: options.parentCtx } : {}),
  })
  ctx.seed(wsConnectionKind, { id, ws })

  if (options?.params) {
    ctx.set(routeParamsKey, options.params)
  }

  return <T>(cb: (...a: any[]) => T) => run(ctx, cb)
}

/**
 * Creates a fully initialized WS message context for testing.
 * Sets up both connection context (parent) and message context (child).
 * Returns a runner function that executes callbacks inside the message context scope.
 */
export function prepareTestWsMessageContext(options: TTestWsMessageContext) {
  const id = options.id ?? 'test-conn-id'
  const ws = createMockWsSocket()

  // Connection context (parent)
  const connectionCtx = new EventContext({
    logger: console as any,
    ...(options.parentCtx ? { parent: options.parentCtx } : {}),
  })
  connectionCtx.seed(wsConnectionKind, { id, ws })

  // Message context (child)
  const messageCtx = new EventContext({ logger: console as any, parent: connectionCtx })
  const rawMessage =
    options.rawMessage ??
    JSON.stringify({
      event: options.event,
      path: options.path,
      data: options.data,
      id: options.messageId,
    })
  messageCtx.seed(wsMessageKind, {
    data: options.data,
    rawMessage,
    messageId: options.messageId,
    messagePath: options.path,
    messageEvent: options.event,
  })

  if (options.params) {
    messageCtx.set(routeParamsKey, options.params)
  }

  return <T>(cb: (...a: any[]) => T) => run(messageCtx, cb)
}
