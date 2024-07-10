import { randomUUID } from 'crypto'

import { useAsyncEventContext } from '../context'

export function useEventId() {
  const { store } = useAsyncEventContext()
  const { init } = store('event')
  const getId = () => init('id', () => randomUUID())
  return { getId }
}
