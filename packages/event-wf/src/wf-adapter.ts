import type { TConsoleBase } from '@prostojs/logger'
import type { Step, TFlowOutput, TStepHandler, TWorkflowSchema, TWorkflowSpy } from '@prostojs/wf'
import { createStep } from '@prostojs/wf'
import { current } from '@wooksjs/event-core'
import type { EventContext, EventContextOptions } from '@wooksjs/event-core'
import type { TWooksHandler, TWooksOptions, Wooks } from 'wooks'
import { WooksAdapterBase } from 'wooks'

import { createWfContext, resumeWfContext } from './event-wf'
import { wfKind } from './wf-kind'
import { WooksWorkflow } from './workflow'

/** Shortcut mappings for workflow event methods. */
export const wfShortcuts = {
  flow: 'WF_FLOW',
  step: 'WF_STEP',
}

/** Configuration options for the WooksWf adapter. */
export interface TWooksWfOptions {
  onError?: (e: Error) => void
  onNotFound?: TWooksHandler
  onUnknownFlow?: (schemaId: string, raiseError: () => void) => unknown
  logger?: TConsoleBase
  eventOptions?: EventContextOptions
  router?: TWooksOptions['router']
}

/** Options for {@link WooksWf.start} and {@link WooksWf.resume}. */
export interface TWfRunOptions<I = unknown, T = unknown, IR = unknown> {
  /** Input for the current step (consumed after execution). */
  input?: I
  /** Spy function to observe step execution. */
  spy?: TWorkflowSpy<T, I, IR>
  /** Cleanup function called when execution ends. */
  cleanup?: () => void
  /**
   * Parent event context to attach to. When provided, the workflow shares
   * this context instead of creating a new one, so step handlers can access
   * composables from the parent scope (e.g. HTTP composables).
   *
   * Pass `current()` from within an active event scope (HTTP handler, etc.).
   */
  eventContext?: EventContext
}

/** Wooks adapter for defining and executing workflow schemas with step-based routing. */
export class WooksWf<T = any, IR = any> extends WooksAdapterBase {
  protected logger: TConsoleBase

  protected wf: WooksWorkflow<T, IR>

  constructor(
    protected opts?: TWooksWfOptions,
    wooks?: Wooks | WooksAdapterBase,
  ) {
    super(wooks, opts?.logger, opts?.router)
    this.logger = opts?.logger || this.getLogger(`${__DYE_CYAN_BRIGHT__}[wooks-wf]`)
    this.wf = new WooksWorkflow(this.wooks)
  }

  /** Attaches a spy function to observe workflow step execution. */
  public attachSpy<I>(fn: TWorkflowSpy<T, I, IR>) {
    return this.wf.attachSpy<I>(fn)
  }

  /** Removes a previously attached workflow spy function. */
  public detachSpy<I>(fn: TWorkflowSpy<T, I, IR>) {
    this.wf.detachSpy<I>(fn)
  }

  /** Registers a workflow step with the given id and handler. */
  public step<I = any>(
    id: string,
    opts: {
      input?: I
      handler: string | TStepHandler<T, I, IR>
    },
  ) {
    const step = createStep<T, I, IR>(id, opts)
    return this.on<Step<T, I, IR>>('WF_STEP', id, () => step)
  }

  /** Registers a workflow flow schema with the given id. */
  public flow(
    id: string,
    schema: TWorkflowSchema<T>,
    prefix?: string,
    init?: () => void | Promise<void>,
  ) {
    this.wf.register(id, schema, prefix)
    return this.on<{ init?: () => void | Promise<void>; id: string }>('WF_FLOW', id, () => ({
      init,
      id,
    }))
  }

  /**
   * Starts a new workflow execution from the beginning.
   *
   * @example
   * ```ts
   * // Simple
   * await app.start('my-flow', { result: 0 })
   *
   * // With options
   * await app.start('my-flow', { result: 0 }, { input: 5, eventContext: current() })
   * ```
   */
  public start<I>(schemaId: string, inputContext: T, opts?: TWfRunOptions<I, T, IR>) {
    const parentCtx = opts?.eventContext
    return this._start(schemaId, inputContext, undefined, opts, parentCtx)
  }

  /**
   * Resumes a previously paused workflow from saved state.
   *
   * @example
   * ```ts
   * // With user input
   * await app.resume(output.state, { input: userInput })
   *
   * // Simple retry (no input)
   * await app.resume(output.state)
   * ```
   */
  public resume<I>(
    state: { schemaId: string; indexes: number[]; context: T },
    opts?: TWfRunOptions<I, T, IR>,
  ) {
    const parentCtx = opts?.eventContext
    return this._start(state.schemaId, state.context, state.indexes, opts, parentCtx)
  }

  protected async _start<I>(
    schemaId: string,
    inputContext: T,
    indexes?: number[],
    opts?: TWfRunOptions<I, T, IR>,
    parentCtx?: EventContext,
  ) {
    const { input, spy, cleanup } = opts ?? {}
    const resume = !!indexes?.length
    const runInContext = (resume ? resumeWfContext : createWfContext)(
      {
        inputContext,
        schemaId,
        stepId: null,
        indexes,
        input,
      },
      this.getEventContextOptions(),
      parentCtx,
    )

    return runInContext(async () => {
      const { handlers: foundHandlers } = this.wooks.lookup(
        'WF_FLOW',
        `/${schemaId}`.replace(/^\/+/u, '/'),
      )
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
            const ctx = current()
            ctx.set(wfKind.keys.input, undefined)
          }
        }
        try {
          for (const handler of handlers) {
            const { id, init } = (await handler()) as {
              init?: () => void | Promise<void>
              id: string
            }
            if (init) {
              await init()
            }
            if (resume) {
              result = await this.wf.resume<I>(
                { schemaId: id, context: inputContext, indexes },
                input as I,
                _spy,
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
        if (result.resume) {
          result.resume = (_input?: I) =>
            this.resume(result.state, { input: _input, spy, cleanup } as TWfRunOptions<I, T, IR>) as Promise<TFlowOutput<T, unknown, IR>>
        }
        return result
      }
      clean()
      throw new Error(`Unknown schemaId: ${schemaId}`)

      function clean() {
        if (cleanup) {
          cleanup()
        }
      }
    })
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
 * Creates a new WooksWf application instance for workflow execution.
 * @param opts - Workflow adapter configuration options
 * @param wooks - Optional existing Wooks or adapter instance to attach to
 * @returns A new WooksWf instance
 * @example
 * ```ts
 * const app = createWfApp()
 * app.step('process', { handler: (ctx) => ctx })
 * app.flow('my-flow', ['process'])
 * await app.start('my-flow', { data: 'hello' })
 * ```
 */
export function createWfApp<T>(opts?: TWooksWfOptions, wooks?: Wooks | WooksAdapterBase) {
  return new WooksWf<T>(opts, wooks)
}
