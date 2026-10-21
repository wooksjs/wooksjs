import type { TConsoleBase } from '@prostojs/logger'
import type { Step, TFlowOutput, TStepHandler, TWorkflowSchema, TWorkflowSpy } from '@prostojs/wf'
import { createStep } from '@prostojs/wf'
import { current, routeParamsKey } from '@wooksjs/event-core'
import type { EventContext, EventContextOptions } from '@wooksjs/event-core'
import type { TWooksHandler, TWooksOptions, TWooksRouteMatch, Wooks } from 'wooks'
import { WooksAdapterBase } from 'wooks'

import { createWfContext, resumeWfContext } from './event-wf'
import type { WfPauseRequest } from './pause-request'
import { stateStrategyNameKey } from './strategy-context'
import { flowPath, normalizeWfId } from './wf-id'
import { flowParamsKey, wfKind } from './wf-kind'
import type { TWfFlowParams } from './wf-kind'
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
  /**
   * When `true`, registering a `WF_STEP` id that is already registered throws
   * instead of warning. Useful in CI to fail loudly on step-id collisions.
   * Mirrors the router's `disableDuplicatePath`.
   *
   * Default (`false`) keeps the permissive behavior — a duplicate id logs a
   * warning and the **first** registration wins — so HMR / dev-restart flows
   * that re-register steps (and reset the shared router via `clearGlobalWooks()`)
   * are not broken.
   */
  strictStepIds?: boolean
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
   * Parent event context. When provided, the workflow creates a child context
   * linked to this parent, so step handlers can transparently read composables
   * from the parent scope (e.g. HTTP composables) via the parent chain.
   *
   * Pass `current()` from within an active event scope (HTTP handler, etc.).
   */
  eventContext?: EventContext
  /**
   * Initial state strategy for the workflow run. Sets the strategy name on
   * the WF event context so steps can inspect it via `useWfStrategy().current()`
   * and swap it via `useWfStrategy().swap(name)`. The final post-swap name
   * is reflected on `output.inputRequired.stateStrategy` (when paused) so
   * callers can persist under the right keyspace without depending on
   * EventContext write-through.
   *
   * The adapter only carries the name — strategy instances live in the
   * caller (HTTP trigger, offline driver, etc.).
   */
  strategy?: { name: string }
  /**
   * `start()` only: the registered flow id the caller expects `schemaId` to
   * run (e.g. the id it was judged on). If the resolved flow differs — a
   * non-deterministic `onNotFound`, a route registered in between — `start()`
   * throws before running the flow's `init` or any step.
   */
  expectSchemaId?: string
}

/**
 * WF_FLOW handlers registered by `flow()` → their flow id, so they resolve
 * without running. Module-level: adapters attached to one router share flows.
 */
const flowIds = new WeakMap<TWooksHandler, string>()

/**
 * Per Wooks instance (= per routing table): registered flow id → the handler
 * that runs it, plus the same keyed by the leading-slash-free id. First
 * registration wins, exactly like the router (which appends duplicate paths
 * and runs the first handler). Resume dispatches through these maps, never
 * through routing.
 */
const flowRegistry = new WeakMap<
  object,
  { byId: Map<string, TWooksHandler>; byCanon: Map<string, TWooksHandler> }
>()

/** Wooks adapter for defining and executing workflow schemas with step-based routing. */
export class WooksWf<T = any, IR = any> extends WooksAdapterBase {
  protected logger: TConsoleBase

  protected wf: WooksWorkflow<T, IR>

  protected eventContextOptions: EventContextOptions

  constructor(
    protected opts?: TWooksWfOptions,
    wooks?: Wooks | WooksAdapterBase,
  ) {
    super(wooks, opts?.logger, opts?.router)
    this.logger = opts?.logger || this.getLogger(`${__DYE_CYAN_BRIGHT__}[wooks-wf]`)
    this.wf = new WooksWorkflow(this.wooks)
    this.eventContextOptions = this.getEventContextOptions()
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
    // The router is shared (a process-global singleton when no Wooks is passed),
    // and it appends duplicate paths instead of throwing — so a step id reused
    // across calls or across adapter instances silently keeps the FIRST handler
    // (resolveStep uses handlers[0]). Surface that here: throw under strict mode,
    // warn otherwise. After clearGlobalWooks() the router is empty, so HMR /
    // dev-restart re-registration that resets the router stays quiet.
    if (this.wooks.matchRoute('WF_STEP', flowPath(id))) {
      if (this.opts?.strictStepIds) {
        throw new Error(
          `WF step "${id}" already registered. Step ids must be unique (strictStepIds enabled).`,
        )
      }
      this.logger.warn(
        `WF step "${id}" registered more than once — the first registration wins. ` +
          `In tests, reset the shared router with clearGlobalWooks() in beforeEach().`,
      )
    }
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
    const handler = () => ({ init, id })
    flowIds.set(handler, id)
    let registry = flowRegistry.get(this.wooks)
    if (!registry) {
      registry = { byId: new Map(), byCanon: new Map() }
      flowRegistry.set(this.wooks, registry)
    }
    if (registry.byId.has(id)) {
      this.logger.warn(
        `WF flow "${id}" registered more than once — the first registration wins. ` +
          `In tests, reset the shared router with clearGlobalWooks() in beforeEach().`,
      )
    } else {
      registry.byId.set(id, handler)
      const canonical = normalizeWfId(id)
      if (!registry.byCanon.has(canonical)) {
        registry.byCanon.set(canonical, handler)
      }
    }
    return this.on<{ init?: () => void | Promise<void>; id: string }>('WF_FLOW', id, handler)
  }

  /**
   * The one rule deciding which WF_FLOW handler a caller's workflow id starts:
   * the first handler of the matching route, else `onNotFound`. Shared by
   * `start()` and `resolveSchemaId()` so the two can never diverge. (Resume
   * does not route — see `findRegisteredFlow()`.)
   */
  protected matchFlow(schemaId: string): {
    match: TWooksRouteMatch | null
    handler: TWooksHandler | undefined
  } {
    const match = this.wooks.matchRoute('WF_FLOW', flowPath(schemaId))
    return { match, handler: match?.route.handlers[0] ?? this.opts?.onNotFound }
  }

  /**
   * Resolves a workflow id, spelled as a caller would pass it to `start()`, to
   * the id of the registered flow that `start()` would run — the id passed to
   * `flow()`, which is also what a paused run stores as `state.schemaId`.
   * Resolution goes through the workflow router, so it honours the router's
   * own matching (percent-decoding, `ignoreCase`, parametric and wildcard
   * flows), and falls back to `onNotFound` exactly like `start()` does.
   * Returns `undefined` when nothing matches.
   *
   * Flows registered with `flow()` resolve without running anything. A custom
   * `WF_FLOW` handler or `onNotFound` reveals its id only when called, so it is
   * called here — inside a throwaway workflow context seeded with the same
   * `schemaId` and route params `start()` would see, linked to
   * `opts.eventContext` (pass the same parent you pass to `start()`, e.g. the
   * HTTP request's `current()`) — and again by `start()`.
   * Such handlers must be pure: return `{ id, init? }` with no side effects.
   * Put side effects in `init`, which runs only on `start()` / `resume()`.
   * A handler that throws here propagates the error.
   *
   * @example
   * ```ts
   * app.flow('user/:id', [...])
   * await app.resolveSchemaId('user/42')   // → 'user/:id'
   * await app.resolveSchemaId('missing')   // → undefined
   * ```
   */
  public async resolveSchemaId(
    schemaId: string,
    opts?: { eventContext?: EventContext },
  ): Promise<string | undefined> {
    const { match, handler } = this.matchFlow(schemaId)
    if (!handler) {
      return undefined
    }
    return flowIds.get(handler) ?? this.idOfHandler(handler, schemaId, match, opts?.eventContext)
  }

  /** Call a custom WF_FLOW handler / `onNotFound` the way `start()` would, to read its id. */
  private async idOfHandler(
    handler: TWooksHandler,
    schemaId: string,
    match: TWooksRouteMatch | null,
    parentCtx?: EventContext,
  ): Promise<string | undefined> {
    const seeds = {
      inputContext: undefined,
      schemaId,
      stepId: null,
      indexes: undefined,
      input: undefined,
    }
    const result = await createWfContext(this.contextOptions(parentCtx), seeds, async () => {
      current().set(routeParamsKey, match?.ctx.params ?? {})
      return (await handler()) as { id?: unknown } | undefined
    })
    return typeof result?.id === 'string' ? result.id : undefined
  }

  private contextOptions(parentCtx?: EventContext): EventContextOptions {
    return parentCtx ? { ...this.eventContextOptions, parent: parentCtx } : this.eventContextOptions
  }

  /**
   * Resume dispatch: the flow registered under exactly `schemaId` — a `flow()`
   * registration on this routing table, or a custom WF_FLOW handler on the
   * route whose own id equals `schemaId` — else the `flow()` registration
   * whose id equals it up to leading slashes (`'x'` ↔ `'/x'`, as adapters
   * differ only there). Never routing look-alikes, never `onNotFound`.
   */
  private async findRegisteredFlow(
    schemaId: string,
    match: TWooksRouteMatch | null,
    parentCtx?: EventContext,
  ): Promise<TWooksHandler | undefined> {
    const registry = flowRegistry.get(this.wooks)
    const registered = registry?.byId.get(schemaId)
    if (registered) {
      return registered
    }
    for (const handler of match?.route.handlers ?? []) {
      const id =
        flowIds.get(handler) ?? (await this.idOfHandler(handler, schemaId, match, parentCtx))
      if (id === schemaId) {
        return handler
      }
    }
    return registry?.byCanon.get(normalizeWfId(schemaId))
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
    return this._start(schemaId, inputContext, opts)
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
    state: { schemaId: string; indexes: number[]; context: T; flowParams?: TWfFlowParams },
    opts?: TWfRunOptions<I, T, IR>,
  ) {
    return this._start(state.schemaId, state.context, opts, {
      indexes: state.indexes,
      flowParams: state.flowParams,
    })
  }

  protected async _start<I>(
    schemaId: string,
    inputContext: T,
    opts?: TWfRunOptions<I, T, IR>,
    resumeOf?: { indexes: number[]; flowParams?: TWfFlowParams },
  ) {
    const { input, spy, cleanup } = opts ?? {}
    const parentCtx = opts?.eventContext
    const indexes = resumeOf?.indexes
    // A resume always dispatches by registered id, even with empty indexes;
    // the engine resumes only when there is a position.
    const resume = resumeOf !== undefined
    const factory = resume ? resumeWfContext : createWfContext
    const ctxOptions = this.contextOptions(parentCtx)
    const seeds = { inputContext, schemaId, stepId: null, indexes, input }

    return factory(ctxOptions, seeds, async () => {
      if (opts?.strategy?.name !== undefined) {
        current().set(stateStrategyNameKey, opts.strategy.name)
      }
      const wfCtx = current()
      let handler: TWooksHandler | undefined
      let flowParams: TWfFlowParams
      if (resume) {
        // A resume carries a registered id (state.schemaId), not a caller's
        // spelling: run exactly that flow or nothing. Routing it would be
        // lossy ('x/', a literal '%', regex params) and could reach another
        // flow or onNotFound.
        const { match } = this.matchFlow(schemaId)
        handler = await this.findRegisteredFlow(schemaId, match, parentCtx)
        // Fire the routing hooks; the params come from the state, not the pattern.
        this.wooks.applyRoute('WF_FLOW', handler ? match : null)
        flowParams = resumeOf?.flowParams ?? {}
      } else {
        const found = this.matchFlow(schemaId)
        handler = found.handler
        this.wooks.applyRoute('WF_FLOW', found.match)
        flowParams = found.match?.ctx.params ?? {}
      }
      wfCtx.set(routeParamsKey, flowParams)
      wfCtx.set(flowParamsKey, flowParams)
      if (handler) {
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
          const { id, init } = (await handler()) as {
            init?: () => void | Promise<void>
            id: string
          }
          if (opts?.expectSchemaId !== undefined && id !== opts.expectSchemaId) {
            throw new Error(
              `Workflow '${schemaId}' resolved to '${id}', expected '${opts.expectSchemaId}' — not started.`,
            )
          }
          if (init) {
            await init()
          }
          result = indexes?.length
            ? await this.wf.resume<I>(
                { schemaId: id, context: inputContext, indexes },
                input as I,
                _spy,
              )
            : await this.wf.start<I>(id, inputContext, input, _spy)
        } catch (error) {
          clean()
          throw error
        }
        clean()
        if (result.state && Object.keys(flowParams).length > 0) {
          // Persist the flow's route params with the state so a resume (which
          // dispatches by registered id, e.g. 'user/:id') restores them.
          ;(result.state as { flowParams?: TWfFlowParams }).flowParams = flowParams
        }
        if (result.inputRequired) {
          // Augment inputRequired with the post-swap strategy name so callers
          // (trigger / offline driver) read it from the output instead of
          // depending on parent-context write-through.
          const ctx = current()
          const finalName = ctx.has(stateStrategyNameKey)
            ? ctx.get(stateStrategyNameKey)
            : undefined
          if (finalName !== undefined) {
            ;(result.inputRequired as unknown as WfPauseRequest).stateStrategy = finalName
          }
        }
        if (result.resume) {
          result.resume = (_input?: I) =>
            this.resume(result.state, { input: _input, spy, cleanup } as TWfRunOptions<
              I,
              T,
              IR
            >) as Promise<TFlowOutput<T, unknown, IR>>
        }
        if (result.retry) {
          result.retry = (_input?: I) =>
            this.resume(result.state, { input: _input, spy, cleanup } as TWfRunOptions<
              I,
              T,
              IR
            >) as Promise<TFlowOutput<T, unknown, IR>>
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
