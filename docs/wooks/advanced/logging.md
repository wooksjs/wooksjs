# Logging in Wooks

Wooks integrates with [`@prostojs/logger`](https://github.com/prostojs/logger) to provide a flexible, type-safe, and composable logging solution. Every event context (e.g., HTTP requests, CLI commands, workflows) has access to an `EventLogger`, a specialized logger instance that includes an `eventId` and supports various logging levels and transports. By default, logs are written to the console with colorized output, but you can configure the logger to your exact requirements.

## Configuring the Logger

You can set global logger options when creating the Wooks application. These options are combined with any `eventLogger` options you pass to the event contexts, allowing you to control:

- **Logging Level:** Determines which log messages are displayed (e.g., `fatal`, `error`, `warn`, `log`, `info`, `debug`).
- **Transports:** Functions or utilities that handle the output of log messages. By default, logs go to the console, but you can add custom transports to write to files, external services, etc.
- **Mapper:** A function that enriches log messages with additional data (like `eventId`).

**Example:**

```ts
import { createHttpApp } from '@wooksjs/event-http';

const app = createHttpApp({
  logger: {
    topic: 'my-super-wooks-app',
    level: 2, // Only fatal and error logs will show globally
    transports: [(log) => console.log(`[${log.topic}][${log.type}] ${log.timestamp}`, ...log.messages)],
  },
  eventOptions: {
    eventLogger: {
      level: 5, // Within this event, allow logs up to 'debug'
      persistLevel: 3, // Persist messages up to 'warn' in memory
    },
  },
});
```

In this example:

- **Global Logger Level:** Set to 2, so only `fatal` and `error` messages show at the global level.
- **Event Logger Level:** Set to 5 inside the event context, enabling all log types (`fatal`, `error`, `warn`, `log`, `info`, `debug`) for that event.
- **Persist Level:** Set to 3 (`warn`), so logs `warn`, `error`, and `fatal` are retained in memory. You can retrieve them later with `getMessages()`.

## Accessing the Logger

### Global Logger

You can retrieve a globally scoped logger from your Wooks application instance:

```ts
const app = createHttpApp();
const myLogger = app.getLogger('my-custom-topic');

// You can now log messages with this logger
myLogger.log('This is a log message');
myLogger.error('This is an error message');
```

This global logger does not attach event-specific data (like `eventId`), but inherits all global configurations, levels, and transports defined when creating the app.

### Event Logger

Inside an event handler (e.g., within a request handler for HTTP), you can access a context-aware logger that’s tied to the current event:

```ts
import { useEventLogger } from '@wooksjs/event-core';

app.get('/some-path', () => {
  const eventLogger = useEventLogger('myTopic');

  eventLogger.debug('debug message');
  eventLogger.log('log message');
  eventLogger.error('error message');

  // Retrieve persisted messages (only those at or above persistLevel are stored)
  const persistedMessages = eventLogger.getMessages();
  console.log('Persisted Messages:', persistedMessages);

  return 'Check your console for logs';
});
```

**Key points:**

- `useEventLogger(topic?: string)` returns an `EventLogger` instance associated with the current event context.
- The logger automatically includes `eventId` in all messages, helping you track logs per event.
- The `topic` parameter allows you to categorize or namespace your logs.

## Logging Levels and Methods

`@prostojs/logger` supports multiple log levels, each corresponding to a method on the logger:

- `fatal(message: unknown, ...args: unknown[])`
- `error(message: unknown, ...args: unknown[])`
- `warn(message: unknown, ...args: unknown[])`
- `log(message: unknown, ...args: unknown[])`
- `info(message: unknown, ...args: unknown[])`
- `debug(message: unknown, ...args: unknown[])`

The `level` number controls which of these methods produce output. For instance, a level of `2` allows `fatal` (0) and `error` (1) logs only.

## Persisting and Retrieving Messages

If you set a `persistLevel`, any log messages at or above that level are stored in memory. You can retrieve them with:

```ts
const persisted = eventLogger.getMessages();
```

This can be useful for debugging, auditing, or displaying logs in a UI.

## Summary

Wooks provides a convenient, integrated logging system through `@wooksjs/event-core` and `@prostojs/logger`. By configuring the logger globally and per-event, you gain fine-grained control over which messages appear, where they’re sent, and how they’re formatted. The `useEventLogger()` function ensures each event can be traced individually, while `app.getLogger()` gives you a topic-scoped logger for application-level logging.

Leverage these features to keep your application’s event handling transparent, debuggable, and easy to maintain.

