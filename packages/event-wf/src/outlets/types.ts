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
  /** Whitelist of allowed workflow IDs. If empty, all are allowed. */
  allow?: string[]
  /** Blacklist of workflow IDs. Checked after allow. */
  block?: string[]
  /**
   * State persistence strategy. Two forms:
   *
   * - **Single-strategy shortcut**: pass a `WfStateStrategy` directly. The
   *   trigger registers it internally under the name `'default'`.
   * - **Named map**: `{ strategies, default }` where `strategies` is a
   *   `Record<name, WfStateStrategy>` and `default` is either the name to use
   *   on workflow start or a function `(wfid) => name` that picks per
   *   workflow id. Steps may then call `swapStrategy(name)` to escalate the
   *   *next* outlet pause to a different strategy.
   *
   * The active strategy name is embedded in the issued token as `<name>.<raw>`,
   * so resume always picks the strategy that persisted the state. Each
   * strategy can therefore have its own independent storage (no need for
   * shared keyspaces between strategies).
   *
   * Strategy names must match `/^[A-Za-z0-9_-]+$/` (validated at trigger
   * invocation).
   */
  state:
    | WfStateStrategy
    | {
        strategies: Record<string, WfStateStrategy>
        default: string | ((wfid: string) => string)
      }
  /** Registered outlets */
  outlets: WfOutlet[]
  /** Token configuration (reading, writing, naming) */
  token?: WfOutletTokenConfig
  /** Parameter name for workflow ID (default: `'wfid'`) */
  wfidName?: string
  /**
   * Initial workflow context factory. Called when starting a new workflow.
   * Receives the parsed request body so you can seed context from the request.
   * Default: `() => ({})` (empty context).
   */
  initialContext?: (body: Record<string, unknown> | undefined, wfid: string) => unknown
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
    },
  ) => Promise<TFlowOutput<unknown, unknown, WfPauseRequest>>
  /** Resume a workflow. Provided by WooksWf or MoostWf. */
  resume: (
    state: { schemaId: string; indexes: number[]; context: unknown },
    opts?: {
      input?: unknown
      eventContext?: unknown
      strategy?: { name: string }
    },
  ) => Promise<TFlowOutput<unknown, unknown, WfPauseRequest>>
}
