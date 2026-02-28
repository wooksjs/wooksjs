# Framework Integrations

Already have a project running on Express, Fastify, or H3? You don't have to rewrite it to try the Wooks way. Our integration adapters let you register Wooks-style route handlers on top of your existing app — adopt composables gradually, one route at a time.

## The Idea

Each integration adapter wraps your framework's app instance and hooks into its request pipeline. When a request arrives:

1. The adapter checks if a matching **Wooks route** exists.
2. If matched — the handler runs with full access to Wooks composables (`useRequest`, `useRouteParams`, `useResponse`, etc.).
3. If not matched — the request **falls through** to the framework's own routing and middleware, completely unchanged.

This means Wooks routes and framework-native routes live side by side. You can migrate incrementally or just use Wooks for the parts where composables shine.

## Common Pattern

Regardless of the framework, the setup always follows the same shape:

```ts
// 1. Create your framework app as usual
const app = createFrameworkApp()

// 2. Attach Wooks to it
const wooks = new WooksAdapter(app)

// 3. Register routes — handlers are plain functions, no req/res
wooks.get('/hello/:name', () => {
    const { get } = useRouteParams()
    return { hello: get('name') }
})

// 4. Start the server through the framework
app.listen(3000)
```

Handlers take **no arguments**. Request data is accessed through composables — on demand, typed, cached per request. Return values become the response body automatically.

## Available Integrations

| Framework | Package | Adapter Class |
|-----------|---------|---------------|
| [Express](/webapp/express) | `@wooksjs/express-adapter` | `WooksExpress` |
| [Fastify](/webapp/fastify) | `@wooksjs/fastify-adapter` | `WooksFastify` |
| [H3](/webapp/h3) | `@wooksjs/h3-adapter` | `WooksH3` |

All adapters share the same composable API — once you learn it for one framework, it works everywhere.
