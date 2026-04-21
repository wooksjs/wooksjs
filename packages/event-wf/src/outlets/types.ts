import type { TFlowOutput } from '@prostojs/wf'
import type { WfOutlet, WfOutletRequest, WfStateStrategy } from '@prostojs/wf/outlets'

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
   * State persistence strategy. Either a single strategy shared by all
   * workflows, or a function that returns a strategy per workflow ID.
   *
   * **Constraint when using the function form.** The trigger resolves the
   * strategy at resume time using the `wfid` from the request. If the resume
   * request does not include `wfid` (e.g. cookie-only transport, token-only
   * body), the trigger calls `config.state('')` — meaning:
   *
   * - EITHER all strategies returned by the function must share the same
   *   underlying storage (same Redis instance, same `WfStateStore`, same
   *   encryption key), so `consume`/`retrieve` operations work regardless of
   *   which strategy instance is picked;
   * - OR every resume request must carry `wfid` so the correct strategy is
   *   always resolved.
   *
   * Violating this contract silently breaks single-use token invalidation:
   * the `consume` call runs against the wrong strategy's storage, and the
   * token remains live in the real strategy.
   */
  state: WfStateStrategy | ((wfid: string) => WfStateStrategy)
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
    opts?: { input?: unknown; eventContext?: unknown },
  ) => Promise<TFlowOutput<unknown, unknown, WfOutletRequest>>
  /** Resume a workflow. Provided by WooksWf or MoostWf. */
  resume: (
    state: { schemaId: string; indexes: number[]; context: unknown },
    opts?: { input?: unknown; eventContext?: unknown },
  ) => Promise<TFlowOutput<unknown, unknown, WfOutletRequest>>
}
