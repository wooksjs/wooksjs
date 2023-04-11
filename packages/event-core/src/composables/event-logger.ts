import { useEventContext } from '../context'
import { EventLogger } from '../event-logger'
import { useEventId } from './event-id'

export function useEventLogger(topic?: string) {
    const { getId } = useEventId()
    const { store, getCtx } = useEventContext()
    const { init } = store('event')
    const ctx = getCtx()
    const get = () => init('logger', () => new EventLogger(getId(), ctx.options?.eventLogger))
    return topic ? get().createTopic(topic) : get()
}
