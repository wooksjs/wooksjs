---
layout: home

title: Wooks
titleTemplate: Home | :title
themeConfig:
    logo: ''
# hero:
# name: Wooks
# text: Next Generation Event Processing Framework
# tagline: Get ready for hooks in web apps.
# image:
#   src: /wooksjs.png
#   alt: WooksJS
# actions:
#   - theme: brand
#     text: Get Started
#     link: /guide/
#   - theme: alt
#     text: Why Wooks?
#     link: /guide/why
#   - theme: alt
#     text: View on GitHub
#     link: https://github.com/wooksjs/wooksjs

features:
    - icon: 💕
      title: Composable Event Handling
      link: /wooks/what#what-is-a-wook
      details: Access event state through wooks — lazy, cached, composable functions inspired by Vue. No callback parameters, no middleware chains.
    - icon: 🕸
      title: HTTP Web Apps
      details: Full-featured HTTP server with typed composables for headers, cookies, auth, body parsing, and more.
      link: /webapp/
    - icon: 🔌
      title: WebSocket Apps
      details: Routed WebSocket server with rooms, broadcasting, and a structured client with RPC, push listeners, and auto-reconnect.
      link: /wsapp/
    - icon: 💻
      title: CLI Apps
      details: Command-line event processing with the same composable pattern — parse args, flags, and commands effortlessly.
      link: /cliapp/
    - icon: ✍
      title: Build Your Own Wooks
      link: /wooks/what#definewook
      details: Create custom composables with `defineWook` to encapsulate and reuse logic across handlers.
    - icon: 🔑
      title: Type Safe
      link: /wooks/type-safety
      details: TypeScript-first with fully typed context slots, route params, and composable return values.
---
