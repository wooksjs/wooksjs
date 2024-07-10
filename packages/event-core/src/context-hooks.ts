import { Hookable } from 'hookable'

class EventContextHooks extends Hookable {
  fireStartEvent(eventType: string) {
    this.callHook('start-event', eventType)
  }

  fireEndEvent(eventType: string, abortReason?: string) {
    this.callHook('end-event', eventType, abortReason)
  }

  onStartEvent(cb: (eventType: string) => void) {
    this.hook('start-event', cb)
  }

  onEndEvent(cb: (eventType: string, abortReason?: string) => void) {
    this.hook('end-event', cb)
  }
}

export const eventContextHooks = new EventContextHooks()
