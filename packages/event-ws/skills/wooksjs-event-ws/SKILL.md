---
name: wooksjs-event-ws
description: Use this skill when working with @wooksjs/event-ws — to create a WebSocket server with createWsApp() or WooksWs, register message handlers with onMessage(), handle connections with onConnect()/onDisconnect(), use composables like useWsConnection(), useWsMessage(), useWsRooms(), useWsServer(), manage rooms and broadcasting with WsRoomManager and WsBroadcastTransport, integrate with event-http via upgrade(), throw WsError for error replies, or test handlers with prepareTestWsConnectionContext()/prepareTestWsMessageContext(). Covers the wire protocol (WsClientMessage, WsReplyMessage, WsPushMessage), standalone and HTTP-integrated modes, heartbeat, and custom serializers.
---

# @wooksjs/event-ws

WebSocket adapter for Wooks with path-based message routing, rooms, broadcasting, and composable context — runs standalone or integrated with `@wooksjs/event-http`.

## How to use this skill

Read the domain file that matches the task. Do not load all files — only what you need.

| Domain                | File                             | Load when...                                                                                                   |
| --------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Core concepts & setup | [core.md](core.md)               | Creating a WS server, understanding the wire protocol, configuring options, standalone vs HTTP-integrated mode |
| Composables           | [composables.md](composables.md) | Using `useWsConnection`, `useWsMessage`, `useWsRooms`, `useWsServer`, or `currentConnection` inside handlers   |
| Rooms & broadcasting  | [rooms.md](rooms.md)             | Managing rooms, broadcasting to groups, cross-instance pub/sub with `WsBroadcastTransport`                     |
| Testing               | [testing.md](testing.md)         | Unit-testing WS handlers with `prepareTestWsConnectionContext` and `prepareTestWsMessageContext`               |

## Quick reference

```ts
import {
  // factory
  createWsApp,
  WooksWs,
  // composables
  useWsConnection,
  useWsMessage,
  useWsRooms,
  useWsServer,
  currentConnection,
  // kinds & types
  wsConnectionKind,
  wsMessageKind,
  WsError,
  WsConnection,
  WsRoomManager,
  // testing
  prepareTestWsConnectionContext,
  prepareTestWsMessageContext,
  // re-exports from event-core
  useRouteParams,
  useLogger,
} from '@wooksjs/event-ws'
```
