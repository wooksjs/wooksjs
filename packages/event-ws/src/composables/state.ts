import type { WsConnection } from '../ws-connection'
import type { WsRoomManager } from '../ws-room-manager'
import type { WsPushMessage, WsReplyMessage } from '../types'
import type { Wooks } from 'wooks'

/** Shared adapter state accessible by composables. Set once by the adapter on creation. */
export interface WsAdapterState {
  connections: Map<string, WsConnection>
  roomManager: WsRoomManager
  serializer: (msg: WsReplyMessage | WsPushMessage) => string | Buffer
  wooks: Wooks
}

let state: WsAdapterState | undefined

/** Called by the WooksWs adapter to expose state to composables. */
export function setAdapterState(s: WsAdapterState): void {
  state = s
}

/** Called by composables to access adapter state. Throws if adapter not initialized. */
export function getAdapterState(): WsAdapterState {
  if (!state) {
    throw new Error('[event-ws] No active WooksWs adapter')
  }
  return state
}
