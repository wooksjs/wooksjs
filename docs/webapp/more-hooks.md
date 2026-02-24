# Custom Composables

In this guide, we'll build custom composables for Wooks HTTP to demonstrate how to extend the framework with your own reusable logic.

## Example: `useUserProfile`

Let's create a composable that resolves the user profile from the Authorization header.

```ts
import { useAuthorization } from '@wooksjs/event-http'
import { defineWook, cached } from '@wooksjs/event-core'

interface TUser {
    username: string
    age: number
}

// Simulated database lookup
function readUser(username: string): Promise<TUser> {
    // Return the user profile from the database
    return db.findUser(username)
}

export const useUserProfile = defineWook((ctx) => {
    const { basicCredentials } = useAuthorization(ctx)
    const username = basicCredentials()?.username

    return {
        username,
        userProfile: async () => {
            if (!username) return null
            return readUser(username)
        },
    }
})

// Usage in a handler
app.get('/user', async () => {
    const { username, userProfile } = useUserProfile()
    console.log('username =', username)
    const data = await userProfile()
    return { user: data }
})
```

The `defineWook` wrapper ensures the factory function runs once per event context. Calling `useUserProfile()` multiple times in the same request returns the same cached object.

## Example: Custom Header Helper

Here's a composable that provides a getter/setter interface for a specific response header:

```ts
import { useResponse } from '@wooksjs/event-http'

function useHeaderRef(name: string) {
    const response = useResponse()

    return {
        get value(): string | undefined {
            return response.getHeader(name) as string | undefined
        },
        set value(val: string | number) {
            response.setHeader(name, val)
        },
    }
}

// Usage
app.get('/test', () => {
    const server = useHeaderRef('x-server')
    server.value = 'My Awesome Server v1.0'
    return 'ok'
})
// Response headers:
// x-server: My Awesome Server v1.0
```

## Example: Request Timing

A composable that tracks how long request processing takes:

```ts
import { defineWook } from '@wooksjs/event-core'
import { useResponse } from '@wooksjs/event-http'

export const useRequestTiming = defineWook(() => {
    const start = Date.now()
    const response = useResponse()

    return {
        elapsed: () => Date.now() - start,
        setTimingHeader: () => {
            response.setHeader('x-response-time', `${Date.now() - start}ms`)
        },
    }
})

// Usage
app.get('/data', async () => {
    const { setTimingHeader } = useRequestTiming()
    const data = await fetchData()
    setTimingHeader()
    return data
})
```

Since `defineWook` caches per context, `Date.now()` captures the time when the composable is first accessed in the request, giving you accurate timing.
