```ts
import { createHttpApp } from '@wooksjs/event-http'
import { createWsApp, useWsMessage, useWsRooms } from '@wooksjs/event-ws'

const http = createHttpApp()
const ws = createWsApp(http)

http.upgrade('/ws', () => ws.upgrade())

ws.onMessage('message', '/chat/:room', () => {
  const { data } = useWsMessage<{ text: string }>()
  const { broadcast } = useWsRooms()
  broadcast('message', data)
})

http.listen(3000)
```
