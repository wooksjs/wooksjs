
# Working with context

`@wooksjs/event-core` provides the low-level utilities for creating, managing, and accessing asynchronous event contexts in Wooks. It enables you to establish strongly typed, per-event storage that persists through async calls without manual propagation. This guide targets advanced users who want to understand `event-core` or create custom event integrations.

## Creating and Running an Event Context

To start, you define:

- **Event Data Interface:** Describes your event’s shape and includes a `type` field.
- **Context Store Interface:** Describes the additional properties you want to store in the event context.

### `createAsyncEventContext()`

**Signature:**

```ts
function createAsyncEventContext<StoreType, EventType extends TGenericEvent>(
  data: StoreType & { event: EventType, options: TEventOptions }
): <T>(callback: (...args: any[]) => T) => T
```

**Usage:**

- Call `createAsyncEventContext()` with your event data and store.
- It returns a function you can use to run any callback inside the newly created event context.

**Key Points:**

- The returned function binds the `AsyncLocalStorage` context so that within the callback, all `useAsyncEventContext()` calls refer to the provided event and store.
- You can nest contexts. A child context can have a `parentCtx` from a previously active event.

### `useAsyncEventContext()`

**Signature:**

```ts
function useAsyncEventContext<StoreType, EventType extends TGenericEvent>(
  expectedTypes?: string | string[]
): {
  getCtx: () => (StoreType & { event: EventType, options: TEventOptions }),
  store: <K extends keyof StoreType>(key: K) => StoreStoreHandle<StoreType[K]>,
  ...
}
```

**Usage:**

- Call `useAsyncEventContext()` within a callback previously executed by `createAsyncEventContext()`.
- If `expectedTypes` is provided, it ensures the current event type matches one of the expected types.
- Returns helper functions (`getCtx()`, `store(key)`, etc.) to interact with the context.

**Key Points:**

- Throws an error if called outside an event context or if the type doesn’t match.
- Ensures type safety: you know exactly what event data and store properties are available.

## Working with Stores

`event-core` provides a structured approach to managing nested state through `store(key)`. Each `key` should represent an object within your store’s type definition, letting you handle multiple properties inside it.

### Store Handle Methods

Calling `store(key)` returns a handle with methods to manage properties inside that store object:

- **`init(propName, getter)`:** Initialize a property if it’s not set. Useful for lazy loading or expensive operations.  
- **`get(propName)`:** Retrieve the property’s value.  
- **`set(propName, value)`:** Set or update the property’s value.  
- **`del(propName)`:** Delete the property’s value.  
- **`entries()`:** Return an array of `[propName, value]` pairs for all properties.  
- **`clear()`:** Remove all properties from the store object.

**Key Points:**

- Use `init` to avoid unnecessary computations or I/O until the property is first accessed.
- Keep your store keys simple and well-structured. Each `key` corresponds to a known object in your store’s type definition.

## Best Practices for Creating Custom Event Contexts

1. **Define Clear Types:**  
   Create explicit interfaces for your event data and store. Strong typing ensures better developer experience and safer refactoring.

2. **Use `init` for Laziness:**  
   If a property requires parsing or fetching data, use `init` to do it once, on-demand.

3. **Organize Your Store:**  
   Assign meaningful `key` names that group related data (e.g., `cookies`, `request`, `auth`), making composables more readable and maintainable.

4. **Validate Event Types:**  
   Use `expectedTypes` in `useAsyncEventContext()` to ensure composables are only called within the correct event flow.

5. **Graceful Error Handling:**  
   If you call `useAsyncEventContext()` outside the correct context or after the event ends, it throws an error. Handle these scenarios as needed for your application.

By following these guidelines, you can build robust, type-safe custom event adapters with `@wooksjs/event-core`, tapping into the same powerful architectural patterns that Wooks uses for HTTP, CLI, and workflow events.
