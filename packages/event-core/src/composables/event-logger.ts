import type { TConsoleBase } from '@prostojs/logger'

import { useAsyncEventContext } from '../context'
import { EventLogger } from '../event-logger'
import { useEventId } from './event-id'

/**
 * Composable that provides a logger scoped to the current event context.
 *
 * @param topic - Optional topic name to create a sub-logger for.
 * @example
 * ```ts
 * const logger = useEventLogger('my-handler')
 * logger.log('processing request')
 * ```
 */
export function useEventLogger(topic?: string): TConsoleBase {
  const { getId } = useEventId()
  const { store, getCtx } = useAsyncEventContext()
  const { init } = store('event')
  const ctx = getCtx()
  const get = () => init('logger', () => new EventLogger(getId(), ctx.options.eventLogger))
  return topic ? get().createTopic(topic) : get()
}
