import type { TFlowOutput } from '@prostojs/wf'
import type { WfOutlet, WfOutletRequest, WfStateStrategy } from '@prostojs/wf/outlets'

export interface WfOutletTokenConfig {
  /** Where to read state token from incoming request (default: `['body', 'query', 'cookie']`) */
  read?: Array<'body' | 'query' | 'cookie'>
  /** Where to write state token in response (default: `'body'`) */
  write?: 'body' | 'cookie'
  /** Parameter name for state token (default: `'wfs'`) */
  name?: string
  /**
   * Token consumption mode per outlet. When `true`, the trigger calls
   * `strategy.consume()` (single-use token) instead of `strategy.retrieve()`
   * on resume. Defaults to `{ email: true }` — email magic links are consumed
   * on first use, HTTP tokens are reusable.
   *
   * Can be a boolean (applies to all outlets) or a per-outlet-name map.
   */
  consume?: boolean | Record<string, boolean>
}

export interface WfOutletTriggerConfig {
  /** Whitelist of allowed workflow IDs. If empty, all are allowed. */
  allow?: string[]
  /** Blacklist of workflow IDs. Checked after allow. */
  block?: string[]
  /** State persistence strategy */
  state: WfStateStrategy | ((wfid: string) => WfStateStrategy)
  /** Registered outlets */
  outlets: WfOutlet[]
  /** Token configuration (reading, writing, naming, consumption) */
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
