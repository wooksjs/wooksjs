# Why Wooks

::: warning
Wooks is an evolving framework. It's fully functional and ready for immediate use, but please note that certain APIs may be fine-tuned as we proceed.
:::

Choosing the right framework for your web applications can be a daunting task. You might have considered Express for its simplicity, or Fastify for its high-speed server performance. Each of these has its merits, but also comes with its set of limitations.

## The Challenges

Event processing, particularly with HTTP requests, poses several hurdles. An event usually carries payload, parts of which may need parsing or validation against various data sources.

Many existing frameworks tend to parse all potentially useful data every time an event is triggered, which can be wasteful when certain data elements are not needed. Moreover, once parsed or fetched, this data needs to be cached for later use.

Traditional middleware-based frameworks tend to attach all this data to the request object, leading to a host of issues:

- The request object becomes overloaded with numerous properties.
- Typing the request object with TypeScript becomes a guessing game.
- The request object's widespread use may unintentionally result in memory leaks.

## The Wooks Solution

Wooks takes a different approach to solve these issues, using the power of **composable functions** (hooks). When a piece of data needs parsing, you just call the relevant composable function to do the job. The same applies to cookies and other data types.

Wooks maintains the integrity of the request object, and instead employs an **event context** for each event. This event context comes with accurate typing, and all interactions with it are strictly through the **event context API**. Composable functions use the event context and store parsed or fetched data there.

## Superior Routing with Wooks

What elevates Wooks further is its use of the robust and fast [@prostojs/router](https://github.com/prostojs/router). It delivers performance on par with find-my-way and radix3, and significantly outperforms the Express router.

But the superiority of `@prostojs/router` doesn't end with speed. It supports parameters and wildcards, even multiple wildcards, a feature that is hard to find among other routers. This level of flexibility and capability makes routing with Wooks an absolute breeze.

## Why Choose Wooks?

So, what sets Wooks apart from the rest?

Wooks provides a solution for on-demand parsing and data fetching, significantly reducing unnecessary workloads. By maintaining the original state of the request object, Wooks eliminates confusion and potential issues associated with data attachment.

With the high-speed, versatile routing provided by @prostojs/router, Wooks sets a new standard in efficient event processing. By introducing the concept of the event context, Wooks allows for efficient handling and storing of data, without any unintended consequences.

Choose Wooks and embrace a smoother, streamlined development experience!
