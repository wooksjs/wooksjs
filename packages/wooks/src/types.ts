/** A route handler function that returns a response synchronously or asynchronously. */
export type TWooksHandler<ResType = unknown> = () => Promise<ResType> | ResType
