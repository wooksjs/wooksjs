# Context and Hooks

In this advanced guide, we will explore how to work with Event Context and create your own hooks in Wooks HTTP.

## Create useUserProfile composable

As an example, let's create a composable that resolves the user profile.

```ts
import { useAuthorization, useHttpContext } from '@wooksjs/event-http';

interface TUser {
    username: string;
    age: number;
    // ...
}

export function useUserProfile() {
    // 1. Get custom-typed context
    const { store } = useHttpContext<{ user: TUser }>();
    const user = store('user');

    // 2. Use basic credentials approach to get the user name in this example
    const { basicCredentials } = useAuthorization();
    const username = basicCredentials()?.username;

    // 3. User profile initializer
    const userProfile = () => user.init('data', () => readUser(username))

    // Abstract readUser function
    function readUser(username: string): Promise<TUser> {
        // Return the user profile from the database
    }

    return {
        username,
        userProfile,
    };
}

// Example of usage of our useUserProfile composable
app.get('/user', async () => {
    const { username, userProfile } = useUserProfile();
    console.log('username =', username);
    const data = await userProfile();
    return { user: data };
});
```

In the above example, we define the `useUserProfile` composable that makes use of the `useHttpContext` and `useAuthorization` hooks provided by Wooks HTTP.
The composable resolves the user profile by retrieving the user data from the event context store or fetching the data from the database.

### Create useHeaderHook

Here's an example of a custom hook for setting headers.

```ts
import { useSetHeaders } from '@wooksjs/event-http';
import { attachHook } from '@wooksjs/event-core';

function useHeaderHook(name: string) {
    const { setHeader, headers } = useSetHeaders();

    return attachHook(
        {
            name,
            type: 'header',
        },
        {
            get: () => headers()[name] as string,
            set: (value: string | number) => setHeader(name, value),
        }
    );
}

// Usage
app.get('/test', () => {
    const myHeader = useHeaderHook('x-my-header');
    myHeader.value = 'header value';
    // *Please note that useSetHeader('x-my-header') will work similarly*
    return 'ok';
});

// Result:
// 200
// Headers:
// x-my-header: header value
```

In the above example, we define the `useHeaderHook` function that creates a custom hook for setting headers.
The hook utilizes the `useSetHeaders` composable provided by Wooks HTTP to access the `setHeader` and headers functions.
It returns an `ref`-object that allows you to get and set the value of the specified header.

## How to Restore the Event Context

To restore the Event Context within a handler, you can use the `restoreCtx` and functions provided by the `useHttpContext` hook.

```ts
import { useHttpContext } from '@wooksjs/event-http';

async function someHandler() {
    const { restoreCtx, clearCtx } = useHttpContext();
    await ... // Some async operations
    restoreCtx();
    // Here the Wooks Context is restored
}
```

In the example above, within the `someHandler` function, we use the `useHttpContext` hook to retrieve the `restoreCtx` and `clearCtx` functions.
After performing some async operations, we can call `restoreCtx()` to restore the Event Context.
This allows subsequent operations within the handler to have access to the restored context.

By using the `restoreCtx` function, you can ensure that the Event Context is maintained and accessible throughout the execution of your handler.

That's how you can work with Event Context and create your own hooks in Wooks HTTP.
Refer to the [Event Context](/wooks/advanced/context) for more details.
