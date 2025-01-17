import type { Step } from '@prostojs/wf'
import { Workflow } from '@prostojs/wf'
import type { Wooks } from 'wooks'

import { useWFContext } from './event-wf'

export class WooksWorkflow<T, IR> extends Workflow<T, IR> {
  constructor(protected wooks: Wooks) {
    super([])
  }

  protected resolveStep<I, IR2>(stepId: string): Step<T, I, IR2> {
    const stepIdNorm = `/${stepId}`.replace(/\/{2,}/gu, '/')
    try {
      const store = useWFContext().store('event')
      const found = this.wooks.lookup('WF_STEP' as 'GET', stepIdNorm)
      if (found.handlers?.length) {
        store.set('stepId', stepIdNorm)
        return found.handlers[0]() as Step<T, I, IR2>
      }
    } catch (error) {
      const router = this.wooks.getRouter()
      const found = router.lookup('WF_STEP' as 'GET', stepIdNorm)
      if (found?.route?.handlers.length) {
        return found.route.handlers[0]() as Step<T, I, IR2>
      }
    }
    throw new Error(`Step "${stepIdNorm}" not found.`)
  }
}
