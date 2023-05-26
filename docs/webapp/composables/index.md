# Composables

A composable function, also known as a hook, is a function that connects you to the event context, which includes URL parameters, request body, cookies, and more.

Wooks HTTP provides various useful composable functions that can be categorized into the following groups:

- [Request Composables](./request.md): Functions related to the request, such as headers, cookies, and the request body.
- [Response Composables](./request.md): Functions for setting the response, including setting headers and cookies.

You can also create your own composables to encapsulate additional logic, such as retrieving user data based on cookies or authentication headers.

::: warning
All composable functions must be called before any asynchronous operations because the event context is lost after asynchronous commands.

If you need to call composables after asynchronous operations, you must first restore the context.
To restore the context, you can use the `useHttpContext` composable.
Refer to the [Event Context](../../advanced/context.md) for more details.
:::

::: code-group

```js [Synchronously]
import { useSetHeader, useSetCookies } from '@wooksjs/event-http'

app.get('/async', async () => {
    // Call the composables synchronously here
    const myHeader = useSetHeader('my-header')

    myHeader.value = 'value before await'

    await ... // Some asynchronous code
    // At this point, the event context is already lost

    myHeader.value = 'value after await' // But hooks are still working

    const { setCookie } = useSetCookies() // Avoid doing this // [!code error]
})
```

```js [Asynchronously]
import { useSetHeader, useSetCookies, useHttpContext } from '@wooksjs/event-http'

app.get('/async', async () => {
    const myHeader = useSetHeader('my-header')
    const { restoreCtx } = useHttpContext() // Here's the restoreCtx function // [!code ++]

    myHeader.value = 'value before await'

    await ... // Some asynchronous code
    // At this point, the event context is already lost

    myHeader.value = 'value after await' // But hooks are still working

    restoreCtx() // [!code ++]
    // The event context is restored after calling restoreCtx()

    const { setCookie } = useSetCookies() // Works fine now // [!code hl]
})
```

:::
