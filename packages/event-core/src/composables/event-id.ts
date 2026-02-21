import { randomUUID } from 'crypto'

import { useAsyncEventContext } from '../context'

/**
 * Composable that provides a unique event ID for the current event context.
 *
 * @example
 * ```ts
 * const { getId } = useEventId()
 * console.log(getId()) // '550e8400-e29b-41d4-a716-446655440000'
 * ```
 */
export function useEventId(): { getId: () => string } {
  const { store } = useAsyncEventContext()
  const { init } = store('event')
  const getId = () => init('id', () => randomUUID())
  return { getId }
}
