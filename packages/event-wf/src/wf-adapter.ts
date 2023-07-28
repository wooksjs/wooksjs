import { TWooksHandler, TWooksOptions, Wooks, WooksAdapterBase } from 'wooks'
import { createWfContext, resumeWfContext } from './event-wf'
import { TConsoleBase } from '@prostojs/logger'
import { TEventOptions } from '@wooksjs/event-core'
import { Step, TFlowOutput, TStepHandler, TWorkflowSchema, createStep } from '@prostojs/wf'
import { WooksWorkflow } from './workflow'

export const wfShortcuts = {
    flow: 'WF_FLOW',
    step: 'WF_STEP',
}

export interface TWooksWfOptions {
    onError?(e: Error): void
    onNotFound?: TWooksHandler<unknown>
    onUnknownFlow?: (schemaId: string, raiseError: () => void) => unknown
    logger?: TConsoleBase
    eventOptions?: TEventOptions
    router?: TWooksOptions['router']
}

export class WooksWf<T> extends WooksAdapterBase {
    protected logger: TConsoleBase

    protected wf: WooksWorkflow<T>

    constructor(
        protected opts?: TWooksWfOptions,
        wooks?: Wooks | WooksAdapterBase
    ) {
        super(wooks, opts?.logger, opts?.router)
        this.logger = opts?.logger || this.getLogger('wooks-wf')
        this.wf = new WooksWorkflow(this.wooks)
    }

    public step<I = any, D = any>(id: string, opts: {
        input?: D
        handler: string | TStepHandler<T, I, D>
    }) {
        const step = createStep<T, I, D>(id, opts)
        return this.on<Step<T, I, D>>('WF_STEP', id, () => step)
    }

    public flow(id: string, schema: TWorkflowSchema<T>, init?: () => void | Promise<void>) {
        this.wf.register(id, schema)
        return this.on<{ init?: () => void | Promise<void>, id: string }>('WF_FLOW', id, () => ({ init, id }))
    }

    public start<I>(schemaId: string, inputContext: T, input?: I, cleanup?: () => void) {
        return this._start(schemaId, inputContext, undefined, input, cleanup)
    }

    public resume<I>(schemaId: string, inputContext: T, indexes: number[], input?: I, cleanup?: () => void) {
        return this._start(schemaId, inputContext, indexes, input, cleanup)
    }

    protected async _start<I>(schemaId: string, inputContext: T, indexes?: number[], input?: I, cleanup?: () => void) {
        const resume = !!indexes?.length
        const { restoreCtx, clearCtx } = (resume ? resumeWfContext : createWfContext)({
            inputContext,
            schemaId,
            indexes,
            input,
        }, this.mergeEventOptions(this.opts?.eventOptions))
        const { handlers: foundHandlers } = this.wooks.lookup('WF_FLOW', '/' + schemaId)
        const handlers = foundHandlers ||
            (this.opts?.onNotFound && [this.opts.onNotFound]) ||
            null
        if (handlers && handlers.length) {
            let result: TFlowOutput<T, I> = {} as TFlowOutput<T, I>
            try {
                for (const handler of handlers) {
                    restoreCtx()
                    const { id, init } = (await handler()) as { init?: () => void | Promise<void>, id: string }
                    if (init) {
                        restoreCtx()
                        await init()
                    }
                    restoreCtx()
                    if (resume) {
                        result = await this.wf.resume<I>(id, { context: inputContext, indexes }, input as I)
                        break
                    } else {
                        result = await this.wf.start<I>(id, inputContext, input)
                        break
                    }
                }
            } catch (e) {
                clean()
                throw e
            }
            clean()
            clearCtx()
            return result
        }
        clean()
        function clean() {
            if (cleanup) {
                restoreCtx()
                cleanup()
            }
        }
        clearCtx()
        throw new Error('Unknown schemaId: ' + schemaId)
    }

    protected onError(e: Error) {
        if (this.opts?.onError) {
            this.opts.onError(e)
        } else {
            this.error(e.message)
            process.exit(1)
        }
    }

    protected error(e: string | Error) {
        if (typeof e === 'string') {
            console.error(__DYE_RED__ + 'ERROR: ' + __DYE_RESET__ + e)
        } else {
            console.error(__DYE_RED__ + 'ERROR: ' + __DYE_RESET__ + e.message)
        }
    }
}

/**
 * Factory for WooksWf App
 * @param opts TWooksWfOptions
 * @param wooks Wooks | WooksAdapterBase
 * @returns WooksWf
 */
export function createWfApp<T>(
    opts?: TWooksWfOptions,
    wooks?: Wooks | WooksAdapterBase
) {
    return new WooksWf<T>(opts, wooks)
}
