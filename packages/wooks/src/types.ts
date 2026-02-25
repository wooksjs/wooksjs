import type { Key } from '@wooksjs/event-core'
import type { IncomingMessage } from 'http'
import type { Duplex } from 'stream'

/** A route handler function that returns a response synchronously or asynchronously. */
export type TWooksHandler<ResType = unknown> = () => Promise<ResType> | ResType

/**
 * Contract interface for integrating a WebSocket adapter with the HTTP adapter.
 *
 * The WS adapter implements this interface and provides context keys.
 * The HTTP adapter accepts it via `httpApp.ws(handler)`, sets the keys
 * on the HTTP context during upgrade events, and routes as method 'UPGRADE'.
 */
export interface WooksUpgradeHandler {
  /** Key for the upgrade request (HTTP sets this alongside its own httpKind.keys.req). */
  readonly reqKey: Key<IncomingMessage>
  /** Key for the raw TCP socket from the upgrade event. */
  readonly socketKey: Key<Duplex>
  /** Key for the initial data chunk from the upgrade event. */
  readonly headKey: Key<Buffer>
  /** Fallback handler called by HTTP when no UPGRADE route matches. */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void
}
