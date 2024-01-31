# Routing in Workflows

Workflows in Wooks use [@prostojs/router](https://github.com/prostojs/router) for routing. This means that the route concepts you're familiar with from the router are also applied to workflow steps.

## Steps as Routes

Each step in the workflow is identified by a route, rather than a simple name. This means that step definitions can include parameters or wildcards, which makes workflows more flexible and powerful.

### Static Step

A static step doesn't include any parameters or wildcards in its route:

```ts
app.step('step-name', () => {
  // do something
})
```

### Parametric Step

A parametric step includes one or more route parameters in its route:

```ts
import { useRouteParams } from '@wooksjs/event-core'

app.step('add/:a/:b', ctx => {
  const { get } = useRouteParams()
  ctx.result = get('a') + get('b')
})
```

Here, the route `add/:a/:b` includes parameters `a` and `b`. The values of these parameters are retrieved using the `get` method from `useRouteParams()`.

### Wildcard Step

A wildcard step includes a wildcard (`*`) in its route:

```ts
import { useRouteParams } from '@wooksjs/event-core'

app.step('log/*', ctx => {
  const { get } = useRouteParams()
  console.log(get('*'))
})
```

In this case, the wildcard `*` captures all parameters following `log/` in the route.

### Optional Parameter

A route parameter can be marked as optional by appending a question mark (`?`) to the parameter name:

```ts
app.step('optional/:param?', ctx => {
  // do something
})
```

Here, the step `optional` and `optional/some-value` are both handled by the same step handler, since `param` is marked as optional.

For more details about routing, including advanced routing features and concepts, please refer to the [`@prostojs/router` documentation](https://github.com/prostojs/router/blob/main/README.md).
