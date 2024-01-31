import { randomUUID } from 'crypto'

import { useEventContext } from '../context'

export function useEventId() {
  const { store } = useEventContext()
  const { init } = store('event')
  const getId = () => init('id', () => randomUUID())
  return { getId }
}
