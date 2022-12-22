import { useEventContext } from '../context'
import { randomUUID } from 'crypto'

export function useEventId() {
    const { store } = useEventContext()
    const { init } = store('event')
    const getId = () => init('id', () => randomUUID())
    return { getId }
}
