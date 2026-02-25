/** Error from the WebSocket client (server error reply, timeout, or disconnect). */
export class WsClientError extends Error {
  constructor(
    public readonly code: number,
    message?: string,
  ) {
    super(message ?? `WsClientError ${code}`)
    this.name = 'WsClientError'
  }
}
