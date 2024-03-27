import type { TConsoleBase } from '@prostojs/logger'
import type { Step, TFlowOutput, TStepHandler, TWorkflowSchema, TWorkflowSpy } from '@prostojs/wf'
import { createStep } from '@prostojs/wf'
import type { TEventOptions } from '@wooksjs/event-core'
import type { TWooksHandler, TWooksOptions, Wooks } from 'wooks'
import { WooksAdapterBase } from 'wooks'

import { createWfContext, resumeWfContext, useWFContext } from './event-wf'
import { WooksWorkflow } from './workflow'

export const wfShortcuts = {
  flow: 'WF_FLOW',
  step: 'WF_STEP',
}

export interface TWooksWfOptions {
  onError?: (e: Error) => void
  onNotFound?: TWooksHandler
  onUnknownFlow?: (schemaId: string, raiseError: () => void) => unknown
  logger?: TConsoleBase
  eventOptions?: TEventOptions
  router?: TWooksOptions['router']
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class WooksWf<T = any, IR = any> extends WooksAdapterBase {
  protected logger: TConsoleBase

  protected wf: WooksWorkflow<T, IR>

  constructor(
    protected opts?: TWooksWfOptions,
    wooks?: Wooks | WooksAdapterBase
  ) {
    super(wooks, opts?.logger, opts?.router)
    this.logger = opts?.logger || this.getLogger('wooks-wf')
    this.wf = new WooksWorkflow(this.wooks)
  }

  public attachSpy<I>(fn: TWorkflowSpy<T, I, IR>) {
    return this.wf.attachSpy<I>(fn)
  }

  public detachSpy<I>(fn: TWorkflowSpy<T, I, IR>) {
    this.wf.detachSpy<I>(fn)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public step<I = any>(
    id: string,
    opts: {
      input?: I
      handler: string | TStepHandler<T, I, IR>
    }
  ) {
    const step = createStep<T, I, IR>(id, opts)
    return this.on<Step<T, I, IR>>('WF_STEP', id, () => step)
  }

  public flow(
    id: string,
    schema: TWorkflowSchema<T>,
    prefix?: string,
    init?: () => void | Promise<void>
  ) {
    this.wf.register(id, schema, prefix)
    return this.on<{ init?: () => void | Promise<void>; id: string }>('WF_FLOW', id, () => ({
      init,
      id,
    }))
  }

  public start<I>(
    schemaId: string,
    inputContext: T,
    input?: I,
    spy?: TWorkflowSpy<T, I, IR>,
    cleanup?: () => void
  ) {
    return this._start(schemaId, inputContext, undefined, input, spy, cleanup)
  }

  public resume<I>(
    state: { schemaId: string; indexes: number[]; context: T },
    input?: I,
    spy?: TWorkflowSpy<T, I, IR>,
    cleanup?: () => void
  ) {
    return this._start(state.schemaId, state.context, state.indexes, input, spy, cleanup)
  }

  protected async _start<I>(
    schemaId: string,
    inputContext: T,
    indexes?: number[],
    input?: I,
    spy?: TWorkflowSpy<T, I, IR>,
    cleanup?: () => void
  ) {
    const resume = !!indexes?.length
    const { restoreCtx, clearCtx } = (resume ? resumeWfContext : createWfContext)(
      {
        inputContext,
        schemaId,
        stepId: null,
        indexes,
        input,
      },
      this.mergeEventOptions(this.opts?.eventOptions)
    )
    const { handlers: foundHandlers } = this.wooks.lookup('WF_FLOW', `/${schemaId}`)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const handlers = foundHandlers || (this.opts?.onNotFound && [this.opts.onNotFound]) || null
    if (handlers && handlers.length > 0) {
      let result: TFlowOutput<T, I, IR> = {} as TFlowOutput<T, I, IR>
      let firstStep = true
      const _spy: TWorkflowSpy<T, I, IR> = (...args) => {
        if (spy) {
          spy(...args)
        }
        if (firstStep && args[0] === 'step') {
          // cleanup input after the first step
          firstStep = false
          restoreCtx()
          const { store } = useWFContext()
          store('event').set('input', undefined)
        }
      }
      try {
        // eslint-disable-next-line no-unreachable-loop
        for (const handler of handlers) {
          restoreCtx()
          const { id, init } = (await handler()) as {
            init?: () => void | Promise<void>
            id: string
          }
          if (init) {
            restoreCtx()
            await init()
          }
          restoreCtx()
          if (resume) {
            result = await this.wf.resume<I>(
              { schemaId: id, context: inputContext, indexes },
              input as I,
              _spy
            )
            break
          } else {
            result = await this.wf.start<I>(id, inputContext, input, _spy)
            break
          }
        }
      } catch (error) {
        clean()
        throw error
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
    throw new Error(`Unknown schemaId: ${schemaId}`)
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
      console.error(`${__DYE_RED__}ERROR: ${__DYE_RESET__}${e}`)
    } else {
      console.error(`${__DYE_RED__}ERROR: ${__DYE_RESET__}${e.message}`)
    }
  }
}

/**
 * Factory for WooksWf App
 * @param opts TWooksWfOptions
 * @param wooks Wooks | WooksAdapterBase
 * @returns WooksWf
 */
export function createWfApp<T>(opts?: TWooksWfOptions, wooks?: Wooks | WooksAdapterBase) {
  return new WooksWf<T>(opts, wooks)
}
