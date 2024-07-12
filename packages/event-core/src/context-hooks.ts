import { Hookable } from './hookable'

class EventContextHooks extends Hookable {
  /**
   * SHould be fired right after a new context is created
   */
  fireStartEvent(eventType: string) {
    this.callHook('start-event', eventType)
  }

  /**
   * Should be fired at the very end of event processing
   */
  fireEndEvent(eventType: string, abortReason?: string) {
    this.callHook('end-event', eventType, abortReason)
  }

  // ========================================================

  /**
   * Fires when a new context was just created
   */
  onStartEvent(cb: (eventType: string) => void) {
    return this.hook('start-event', cb)
  }

  /**
   * Fires when event was processed
   */
  onEndEvent(cb: (eventType: string, abortReason?: string) => void) {
    return this.hook('end-event', cb)
  }
}

export const eventContextHooks = new EventContextHooks()
