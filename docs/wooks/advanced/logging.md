# Logging in Wooks

Wooks integrates with [`@prostojs/logger`](https://github.com/prostojs/logger) to provide a flexible and composable logging solution. Every event context has access to a `Logger` instance that supports standard log methods and configurable transports. By default, logs are written to the console with colorized output, but you can configure the logger to your exact requirements.

## Configuring the Logger

You can pass a configured logger instance when creating the Wooks application. The `logger` option accepts any `TConsoleBase`-compatible logger — an object with `error`, `warn`, `log`, `info`, `debug`, and `trace` methods. `ProstoLogger` is the recommended implementation; it lets you configure:

- **Logging Level:** Determines which log messages are displayed (e.g., `fatal`, `error`, `warn`, `log`, `info`, `debug`, `trace`).
- **Transports:** Functions that handle the output of log messages — write to the console, files, external services, etc. Without at least one transport, a `ProstoLogger` emits nothing.
- **Topic:** The constructor's second argument — a label attached to the logger's messages.

**Example (HTTP app):**

```ts
import { createHttpApp } from '@wooksjs/event-http'
import { ProstoLogger } from '@prostojs/logger'

const app = createHttpApp({
  logger: new ProstoLogger(
    {
      level: 1, // Only fatal and error logs will show
      transports: [(log) => console.log(`[${log.topic}][${log.type}] ${log.timestamp}`, ...log.messages)],
    },
    'my-app', // topic
  ),
})
```

**Example (CLI app):**

```ts
import { createCliApp } from '@wooksjs/event-cli'
import { coloredConsole, createConsoleTransort, ProstoLogger } from '@prostojs/logger'

const app = createCliApp({
  logger: new ProstoLogger(
    {
      level: 4, // Show up to info level
      transports: [createConsoleTransort({ format: coloredConsole })],
    },
    'my-cli', // topic
  ),
})
```

The `logger` option works the same across all Wooks adapters.

## Accessing the Logger

### Global Logger

You can retrieve a globally scoped logger from any Wooks application instance:

```ts
const myLogger = app.getLogger('[my-custom-topic]')

myLogger.log('This is a log message')
myLogger.error('This is an error message')
```

This global logger does not attach event-specific data, but inherits all global configurations, levels, and transports defined when creating the app.

### Event Logger

Inside any event handler, you can access a context-aware logger tied to the current event:

```ts
import { useLogger } from '@wooksjs/event-core'

// Works in HTTP handlers, CLI handlers, workflow steps — any event type
const logger = useLogger()

logger.debug('debug message')
logger.info('info message')
logger.error('error message')
```

### Topic-Scoped Logger

You can pass a topic string to `useLogger()` to create a child logger scoped to a specific area. The child logger inherits all configuration (level, transports) from the parent and prefixes its output with the topic:

```ts
import { useLogger } from '@wooksjs/event-core'

const dbLogger = useLogger('db')
dbLogger.info('Connection established')

const authLogger = useLogger('auth')
authLogger.warn('Token expired')
```

Under the hood this calls `logger.createTopic(topic)` on the context's logger. If the logger does not support `createTopic` (e.g. a plain console-style logger), the base logger is returned unchanged.

**Key points:**

- `useLogger()` returns a `Logger` instance associated with the current event context.
- `useLogger('topic')` returns a child logger scoped to that topic.
- You can also import `useLogger` from `'wooks'` — it is re-exported for convenience.

## Logging Levels and Methods

`@prostojs/logger` supports multiple log levels, each corresponding to a method on the logger:

- `fatal(message: unknown, ...args: unknown[])`
- `error(message: unknown, ...args: unknown[])`
- `warn(message: unknown, ...args: unknown[])`
- `log(message: unknown, ...args: unknown[])`
- `info(message: unknown, ...args: unknown[])`
- `debug(message: unknown, ...args: unknown[])`
- `trace(message: unknown, ...args: unknown[])`

The `level` number controls which of these methods produce output — it is inclusive: messages with a level less than or equal to `level` are emitted. For instance, a level of `1` allows `fatal` (0) and `error` (1) logs only, while a level of `2` additionally allows `warn`.

## Summary

Wooks provides a convenient, integrated logging system through `@wooksjs/event-core` and `@prostojs/logger`. By configuring the logger globally, you gain control over which messages appear, where they're sent, and how they're formatted. The `useLogger()` wook gives you access to the event-scoped logger, while `app.getLogger()` provides a topic-scoped logger for application-level logging.
