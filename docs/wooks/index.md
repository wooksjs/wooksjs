# Get Started

::: info
Before diving in, you might want to read more about Wooks to understand its philosophy and advantages:

- [What is Wooks?](/wooks/what)
- [Why Wooks?](/wooks/why)
- [Comparison with Express, Fastify, and h3](/wooks/comparison)
:::

Because Wooks is designed to be event-agnostic, there isn’t a one-size-fits-all "get started" guide. Instead, the initial steps vary depending on the kind of events you want to handle. Wooks provides different “flavors” tailored for distinct event sources:

- **[HTTP Events](/webapp/):** Ideal if you’re building REST APIs, websites, or GraphQL services. This flavor provides a familiar HTTP server interface, routing, and composables for working with request data and responses.
- **[CLI Events](/cliapp/):** Perfect for command-line tools and developer utilities, letting you define commands, arguments, and options just like routes. With Wooks, you can handle CLI inputs as structured events and apply the same composable patterns.
- **[Workflow Events](/wf/):** Useful if you’re building custom pipelines or need a flexible way to handle various asynchronous triggers. This flavor allows you to structure your workflows as events and benefit from Wooks’ context management and composables.

**Next Steps:**
1. **Pick Your Flavor:** Decide whether you want to start with HTTP requests, CLI commands, or workflow events.
2. **Follow the Dedicated Guide:** Check out the “Getting Started” guide for your chosen flavor (e.g., [Get Started with HTTP](/webapp/), [Get Started with CLI](/cliapp/), or [Get Started with Workflows](/wf/)).
3. **Install Packages:** Install the necessary Wooks packages (e.g., `@wooksjs/event-http` for HTTP) and follow the initialization steps outlined in that flavor’s guide.
4. **Write Your First Event Handler:** Create a basic handler to get a feel for how Wooks structures code using composables and context.
5. **Explore Advanced Features:** Once you’ve got the basics down, explore routing optimizations, complex parameter handling, or custom composables to build richer and more maintainable applications.

