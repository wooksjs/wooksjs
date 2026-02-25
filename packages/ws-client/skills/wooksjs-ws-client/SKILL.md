---
name: wooksjs-ws-client
description: Use this skill when working with @wooksjs/ws-client — to create a WebSocket client with createWsClient() or WsClient, send fire-and-forget messages with send(), make RPC calls with call(), subscribe to server paths with subscribe(), listen for push messages with on(), handle reconnection with WsClientReconnectOptions, manage lifecycle events with onOpen()/onClose()/onError()/onReconnect(), use WsClientError for error handling, or configure custom serializers and protocols. Covers the wire protocol (WsClientMessage, WsReplyMessage, WsPushMessage), message queuing during disconnect, and auto-resubscription.
---

# @wooksjs/ws-client

WebSocket client for Wooks with RPC, subscriptions, reconnection, push listeners, and message queuing — works in browsers and Node.js.

## How to use this skill

Read the domain file that matches the task. Do not load all files — only what you need.

| Domain                | File                         | Load when...                                                                                          |
| --------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| Core concepts & setup | [core.md](core.md)           | Creating a client, understanding the wire protocol, configuring options, sending messages             |
| RPC & subscriptions   | [rpc.md](rpc.md)             | Making RPC calls with `call()`, subscribing to paths with `subscribe()`, handling timeouts and errors |
| Push listeners        | [push.md](push.md)           | Listening for server push messages with `on()`, exact and wildcard matching, dispatching              |
| Reconnection          | [reconnect.md](reconnect.md) | Configuring auto-reconnect, backoff strategies, message queuing, auto-resubscription                  |

## Quick reference

```ts
import { createWsClient, WsClient, WsClientError } from '@wooksjs/ws-client'

import type {
  WsClientOptions,
  WsClientReconnectOptions,
  WsClientMessage,
  WsReplyMessage,
  WsPushMessage,
  WsClientPushEvent,
  WsPushHandler,
} from '@wooksjs/ws-client'
```
