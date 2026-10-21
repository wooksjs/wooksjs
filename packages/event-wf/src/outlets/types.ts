import type { TFlowOutput } from '@prostojs/wf'
import type { WfOutlet, WfStateStrategy } from '@prostojs/wf/outlets'

import type { WfPauseRequest } from '../pause-request'

export interface WfOutletTokenConfig {
  /** Where to read state token from incoming request (default: `['body', 'query', 'cookie']`) */
  read?: Array<'body' | 'query' | 'cookie'>
  /** Where to write state token in response (default: `'body'`) */
  write?: 'body' | 'cookie'
  /** Parameter name for state token (default: `'wfs'`) */
  name?: string
}

export interface WfOutletTriggerConfig {
  /**
   * Flows that may be started or resumed through this trigger — fails closed:
   * a flow is admitted only if an entry equals its **registered id** (the
   * pattern for a parametric flow, e.g. `'user/:id'`), ignoring leading
   * slashes. Omitted: every flow is allowed. `[]`: none. Full rules: Outlets
   * guide → "Access Control".
   */
  allow?: string[]
  /**
   * Flows refused on start and on resume through this trigger: for every
   * entry, the flow that id runs plus the flow registered under exactly it
   * (`'user/42'` blocks the whole `'user/:id'` flow). Checked after `allow`.
   * Full rules: Outlets guide → "Access Control".
   */
  block?: string[]
  /**
   * State persistence strategy. Two forms:
   *
   * - **Single-strategy shortcut**: pass a `WfStateStrategy` directly. The
   *   trigger registers it internally under the name `'default'`.
   * - **Named map**: `{ strategies, default }` where `strategies` is a
   *   `Record<name, WfStateStrategy>` and `default` is either the name to use
   *   on workflow start or a function `(wfid, flowId) => name` that picks per
   *   workflow (arguments as for `initialContext`). Steps may then call `swapStrategy(name)` to escalate the *next* outlet
   *   pause to a different strategy.
   *
   * The active strategy name is embedded in the issued token as `<name>.<raw>`,
   * so resume always picks the strategy that persisted the state. Each
   * strategy can therefore have its own independent storage (no need for
   * shared keyspaces between strategies).
   *
   * Strategy names must match `/^[A-Za-z0-9_-]+$/` (validated at trigger
   * invocation).
   *
   * On resume the trigger calls `retrieve()` (to check `allow`/`block`) before
   * `consume()`. A custom strategy's `retrieve()` must be side-effect free and
   * must not invalidate the handle — otherwise every resume fails with 410.
   */
  state:
    | WfStateStrategy
    | {
        strategies: Record<string, WfStateStrategy>
        default: string | ((wfid: string, flowId: string) => string)
      }
  /**
   * Opt-in (default `false`): when a resumed step throws (`true`), or throws an
   * error the predicate accepts, re-persist the pre-step state under the same
   * token so it can be retried — at most `maxRestores` times, never extending
   * its lifetime. **Rolls back everything the step wrote to the workflow
   * context, including attempt counters.** Full semantics: Outlets guide →
   * "Retrying a failed resume".
   */
  restoreOnError?: boolean | ((error: unknown) => boolean)
  /** Hard cap on `restoreOnError` restores per handle (default `3`). */
  maxRestores?: number
  /** Registered outlets */
  outlets: WfOutlet[]
  /** Token configuration (reading, writing, naming) */
  token?: WfOutletTokenConfig
  /** Parameter name for workflow ID (default: `'wfid'`) */
  wfidName?: string
  /**
   * Initial workflow context factory. Called when starting a new workflow.
   * Receives the parsed request body, the caller's `wfid` (e.g. `'user/42'`)
   * and `flowId` — the registered flow the request runs (`'user/:id'`; same id
   * as `state.schemaId`; the raw `wfid` without a resolver). Prefer `flowId`
   * for decisions: every spelling that runs a flow resolves to it. Without
   * `allow`/`block`, `flowId` is the resolver's answer: with a
   * non-deterministic `onNotFound` the flow that runs may differ.
   * Default: `() => ({})` (empty context).
   */
  initialContext?: (
    body: Record<string, unknown> | undefined,
    wfid: string,
    flowId: string,
  ) => unknown
  /**
   * Called when a workflow finishes. If provided, its return value becomes the
   * HTTP response — overriding `useWfFinished()`. This keeps steps transport-agnostic
   * when the completion response is always the same shape.
   *
   * If not provided, falls back to `useWfFinished()` or `{ finished: true }`.
   */
  onFinished?: (ctx: { context: unknown; schemaId: string }) => unknown
}

export interface WfOutletTriggerDeps {
  /** Start a workflow. Provided by WooksWf or MoostWf. */
  start: (
    schemaId: string,
    context: unknown,
    opts?: {
      input?: unknown
      eventContext?: unknown
      strategy?: { name: string }
      /** the registered flow id the request was judged on — run nothing else */
      expectSchemaId?: string
    },
  ) => Promise<TFlowOutput<unknown, unknown, WfPauseRequest>>
  /** Resume a workflow. Provided by WooksWf or MoostWf. */
  resume: (
    state: {
      schemaId: string
      indexes: number[]
      context: unknown
      flowParams?: Record<string, string | string[]>
    },
    opts?: {
      input?: unknown
      eventContext?: unknown
      strategy?: { name: string }
    },
  ) => Promise<TFlowOutput<unknown, unknown, WfPauseRequest>>
  /**
   * Resolve a caller-supplied workflow ID to the registered flow `start()`
   * would run, or `undefined` (`WooksWf.resolveSchemaId`). The trigger passes
   * the same `eventContext` it passes to `start()`. Strongly recommended:
   * without it `allow`/`block` fall back to a conservative check (Outlets
   * guide → "Access Control").
   */
  resolveSchemaId?: (
    wfid: string,
    opts?: { eventContext?: unknown },
  ) => string | undefined | Promise<string | undefined>
}
