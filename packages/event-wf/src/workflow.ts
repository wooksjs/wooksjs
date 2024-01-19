import { Step, Workflow } from '@prostojs/wf'
import { Wooks } from 'wooks'
import { useWFContext } from './event-wf'

export class WooksWorkflow<T, IR> extends Workflow<T, IR> {
    constructor(protected wooks: Wooks) {
        super([])
    }

    protected resolveStep<I, IR>(stepId: string): Step<T, I, IR> {
        const stepIdNorm = ('/' + stepId).replace(/\/\/+/g, '/')
        try {
            useWFContext()
            const found = this.wooks.lookup('WF_STEP' as 'GET', stepIdNorm)
            if (found?.handlers?.length) {
                return found.handlers[0]() as Step<T, I, IR>
            }
        } catch (e) {
            const router = this.wooks.getRouter()
            const found = router.lookup('WF_STEP' as 'GET', stepIdNorm)
            if (found?.route?.handlers?.length) {
                return found.route.handlers[0]() as Step<T, I, IR>
            }
        }
        throw new Error(`Step "${stepIdNorm}" not found.`)
    }
}
