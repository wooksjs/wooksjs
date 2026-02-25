/** WebSocket error with a numeric code following HTTP conventions (401, 403, 404, 500, etc.). */
export class WsError extends Error {
  constructor(
    public readonly code: number,
    message?: string,
  ) {
    super(message ?? `WsError ${code}`)
    this.name = 'WsError'
  }
}
