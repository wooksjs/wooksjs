import { WebSocketServer } from 'ws'

import type { WsServerAdapter } from '../types'

/** Creates the default WsServerAdapter wrapping the `ws` package (peer dependency). */
export function createDefaultWsServerAdapter(): WsServerAdapter {
  return {
    create() {
      const wss = new WebSocketServer({ noServer: true })
      return {
        handleUpgrade: (req, socket, head, cb) => {
          wss.handleUpgrade(req, socket, head, (ws) => {
            cb(ws as any)
          })
        },
        close: () => {
          wss.close()
        },
      }
    },
  }
}
