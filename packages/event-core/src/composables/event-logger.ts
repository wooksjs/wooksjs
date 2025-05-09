import type { TConsoleBase } from '@prostojs/logger'

import { useAsyncEventContext } from '../context'
import { EventLogger } from '../event-logger'
import { useEventId } from './event-id'

export function useEventLogger(topic?: string): TConsoleBase {
  const { getId } = useEventId()
  const { store, getCtx } = useAsyncEventContext()
  const { init } = store('event')
  const ctx = getCtx()
  const get = () => init('logger', () => new EventLogger(getId(), ctx.options.eventLogger))
  return topic ? get().createTopic(topic) : get()
}
