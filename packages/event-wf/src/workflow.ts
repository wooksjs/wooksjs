import { Step, Workflow } from '@prostojs/wf'
import { Wooks } from 'wooks'
import { useWFContext } from './event-wf'

export class WooksWorkflow<T> extends Workflow<T> {
    constructor(protected wooks: Wooks) {
        super([])
    }

    protected resolveStep<I, D>(stepId: string): Step<T, I, D> {
        const stepIdNorm = stepId.replace(/\/\/+/g, '/')
        try {
            useWFContext()
            const found = this.wooks.lookup('WF_STEP' as 'GET', stepIdNorm)
            if (found?.handlers?.length) {
                return found.handlers[0]() as Step<T, I, D>
            }
        } catch (e) {
            const router = this.wooks.getRouter()
            const found = router.lookup('WF_STEP' as 'GET', stepIdNorm)
            if (found?.route?.handlers?.length) {
                return found.route.handlers[0]() as Step<T, I, D>
            }
        }
        throw new Error(`Step "${stepIdNorm}" not found.`)
    }
}
