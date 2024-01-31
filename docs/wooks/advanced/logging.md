# Logging in Wooks

Wooks comes with a built-in logging mechanism based on the npm package [@prostojs/logger](https://github.com/prostojs/logger/).
Whether you are using Wooks CLI or Wooks HTTP, the logging mechanism is readily available
to help you manage and track log messages.
Additionally, each event in Wooks can have its own logger, allowing you to persist logs during event execution if needed.

# Logger Options

To specify options for the logger, you can provide the `eventLogger` property in the `eventOptions` object
when calling `createCliApp` or `createHttpApp`.
The `eventLogger` options object may contain the following props:

- `topic` (optional): Used to distinguish the origin of log messages. This allows you to categorize and organize log messages based on different topics.
- `persistLevel` (optional): Specifies the maximum log level that will be stored in the logger instance. Messages above this level will not be persisted.
- `level` (optional): Defines the filter for the log level. Only log messages at or below this level will be processed and sent to transports.
- `transports` (optional): An array of functions that will be called for each log message. Transports serve as destinations for log messages, such as console logs, files, or external APIs.
- `mapper` (optional): A function that can be used to map log messages to a desired format. This allows you to customize the structure or content of the log messages.
- `levels` (optional): A list of level names. By default, the following levels are used: `fatal`, `error`, `warn`, `log`, `info`, `debug`, and `trace`. You can customize this list based on your specific logging requirements.

# Logger and EventLogger

In Wooks, you have two options for configuring logging: `logger` and `eventLogger`.

`logger`: This option allows you to define a single logger for the entire Wooks instance.
It provides a unified logging experience across all events and commands.

`eventLogger`: With the eventLogger option, you can customize the logging behavior for each event in Wooks.
Each event will have its own logger instance, identified by an `eventId`.
This allows you to have granular control over event-specific logging and even persist log messages during the execution of an event using the `persistLevel` option.

# Usage

To create a Wooks HTTP instance with customized logging configuration,
you can use the `createHttpApp` function from `@wooksjs/event-http` package.
By providing the logger and eventOptions options, you can configure the overall logger for the Wooks instance and the event-specific logger.

Here's an example that demonstrates the creation of a Wooks HTTP instance with logging configuration:

:::tip
The same approach is applicable for `createCliApp` from `@wooksjs/event-cli`
:::

```js
import { createHttpApp } from '@wooksjs/event-http'
import { useEventLogger } from '@wooksjs/event-core'

const app = createHttpApp({
  logger: {
    topic: 'my-super-wooks-app',
    level: 2, // Allow only fatal and error logs
    transports: [
      log => console.log(`[${log.topic}][${log.type}] ${log.timestamp}`, ...log.messages),
    ],
  },
  eventOptions: {
    eventLogger: {
      level: 5, // Allow fatal, error, warn, log, info, and debug logs
      persistLevel: 3, // Persist only fatal, error, and warn logs
    },
  },
})

// You can get a logger instance with your own topic to reuse
// logging formatting and transports logic for your application logs
const myLogger = app.getLogger('new topic')
```

In the above example, we create a Wooks HTTP instance using `createHttpApp`.
We provide the logger option, which specifies the configuration for the overall logger of the Wooks instance.
The topic property allows you to provide a custom topic for the logger, such as `'my-super-wooks-app'`.
The level property sets the log level, allowing only logs with levels of fatal and error to be processed.
We define a custom transport function that logs the messages to the console.

Additionally, we configure the `eventLogger` through the `eventOptions`.
The level property determines the log level for the event-specific logger, allowing logs with levels of
`fatal`, `error`, `warn`, `log`, `info`, and `debug`.
The `persistLevel` property specifies the maximum log level that will be stored in the logger during the event execution,
persisting only logs with levels of `fatal`, `error`, and `warn`.

Inside an event route handler, you can use the `useEventLogger` composable function from `@wooksjs/event-core`
package to retrieve the event-specific logger instance.
This allows you to log messages within the event using the logger associated with that specific event. Here's an example:

```js
app.get('/some-path', () => {
  const eventLogger = useEventLogger('myTopic')

  // Logging examples
  eventLogger.debug('debug message')
  eventLogger.log('log message')
  eventLogger.error('error message')

  const persistedMessages = eventLogger.getMessages() // Retrieve the persisted messages
  console.log(persistedMessages)
})
```

In the above example, within the event route handler for `/some-path`, we use the `useEventLogger` function
to retrieve the `eventLogger` instance associated with the event.
We can then log messages at different levels using the `eventLogger` instance.

To access the persisted messages, we use the `getMessages` method of the `eventLogger`.
This method returns an array of `messages` that were persisted during the event execution,
based on the configured `persistLevel`.
In the example, we retrieve the persisted messages using `eventLogger.getMessages()` and log them to the console.

By configuring the logger and event-specific logger options, you can customize
the logging behavior of your Wooks project to suit your application's requirements.
