import { ProstoRouter } from '@prostojs/router'

import { normalizeWfId } from '../wf-id'

import type { WfOutletTriggerConfig, WfOutletTriggerDeps } from './types'
import { warnOnce } from './warn-once'

/*
 * ─── Outlet trigger access spec (allow / block) ──────────────────────────
 *
 * flowOf(id)  — the registered flow that `start(id)` would run: the first
 *               matching WF_FLOW route, else `onNotFound`; `undefined` if none.
 *               Provided by `deps.resolveSchemaId` (`WooksWf.resolveSchemaId`).
 * canon(id)   — the id with leading slashes stripped (`normalizeWfId`).
 *
 * BLOCK — the denied flows are, for every entry e:
 *           canon(flowOf(e))  (when e resolves), and
 *           canon(e)          (the flow registered under exactly that id).
 *         Over-blocking is allowed; under-blocking never is. An entry that
 *         resolves to no flow (or whose resolution throws) warns once.
 *
 * ALLOW — fails closed. `allow` omitted: every flow is admitted. Otherwise a
 *         flow F is admitted only if some entry's canon(e) equals canon(F) —
 *         F's registered id, i.e. its pattern for a parametric flow.
 *         Resolution is NEVER used to admit: an entry that is not a
 *         registered id admits nothing (it warns once when it resolves to a
 *         different flow or to none). `allow: []` admits nothing.
 *
 * A request is judged on its flow identity:
 *   start  — F = flowOf(wfid). While lists are set, a wfid that resolves to
 *            no flow is refused (404) — nothing it could run is admitted.
 *   resume — F = the stored state.schemaId. The adapter dispatches a resume
 *            ONLY to the flow registered under exactly that id, else to the
 *            one equal up to leading slashes (same canon, so the same
 *            verdict) — never by routing, never to onNotFound; otherwise it
 *            fails with "Unknown schemaId". So the flow judged is the flow
 *            that runs.
 * Resolution runs in a throwaway WF context parented to the request context
 * — the parent start() gets — so a request-reading onNotFound resolves as it
 * runs. Start and resume therefore always judge the same flow the same way.
 *
 * Every `block` entry is resolved on every request, in that request's
 * context — a verdict never depends on another request.
 * `start()` is also told the flow id it was judged on (`expectSchemaId`) and
 * refuses to run anything else, so the judged flow is the flow that runs even
 * if resolution is not deterministic.
 *
 * FALLBACK (deps without `resolveSchemaId`) — flowOf is unknown, so:
 *   - a warning is logged once when lists are set;
 *   - a wfid containing `%` or `?` is refused with 400 while lists are set;
 *   - BLOCK over-matches: an id is blocked if its case-/trailing-slash-folded
 *     form equals an entry's, or if the entry, used as a route pattern on a
 *     case-insensitive, trailing-slash-insensitive router, matches it
 *     (params, optional params, multi-param segments, regex params, `*`);
 *   - ALLOW is exact on canon(wfid) at start and canon(schemaId) at resume.
 *   The fallback cannot see `onNotFound`, and at start `allow` judges the
 *   request spelling, not the flow it runs.
 */

/** A refused request: HTTP status + error message for the response body. */
interface Refusal {
  status: 400 | 403 | 404
  error: string
}

/** `flowOf(id)` bound to the request context; a throwing resolution counts as unresolved. */
type Resolve = (id: string) => Promise<string | undefined>

/** Whether `allow` / `block` restrict this trigger at all. */
export function hasAccessLists(config: WfOutletTriggerConfig): boolean {
  return config.allow !== undefined || (config.block?.length ?? 0) > 0
}

const neverBlocked = (_flowId: string) => false

/** `allow` entries are context-free — canonicalise each array once. */
const allowSets = new WeakMap<string[], Set<string>>()

function allowSetOf(allow: string[]): Set<string> {
  let set = allowSets.get(allow)
  if (!set) {
    set = new Set(allow.map(normalizeWfId))
    allowSets.set(allow, set)
  }
  return set
}

/**
 * Build the allow/block decision for one trigger request (see the spec above).
 * `eventContext` is the parent `start()` will get, so a context-aware
 * `onNotFound` resolves exactly as it would run.
 */
export async function createWfAccess(
  config: WfOutletTriggerConfig,
  deps: WfOutletTriggerDeps,
  eventContext?: unknown,
) {
  const allow = config.allow && allowSetOf(config.allow)
  const blockEntries = config.block ?? []
  const listsSet = hasAccessLists(config)
  const resolveSchemaId = deps.resolveSchemaId
  const resolve: Resolve | undefined =
    resolveSchemaId &&
    (async (id) => {
      try {
        return await resolveSchemaId(id, { eventContext })
      } catch {
        return undefined
      }
    })

  let isBlocked: (flowId: string) => boolean = neverBlocked
  if (resolve) {
    if (config.allow) {
      await warnOnUnregisteredAllowEntries(config.allow, resolve)
    }
    if (blockEntries.length > 0) {
      const denied = await blockedFlows(blockEntries, resolve)
      isBlocked = (flowId) => denied.has(normalizeWfId(flowId))
    }
  } else {
    if (listsSet) {
      warnOnce(
        'no-resolver',
        'Workflow outlet trigger has allow/block lists but no deps.resolveSchemaId — ids cannot be ' +
          'resolved to registered flows, so the lists cannot be guaranteed. ' +
          'Use createOutletHandler(wfApp) or pass resolveSchemaId.',
      )
    }
    if (blockEntries.length > 0) {
      isBlocked = fallbackBlockMatcher(blockEntries)
    }
  }

  const judge = (flowId: string, shown: string): Refusal | undefined => {
    if (allow && !allow.has(normalizeWfId(flowId))) {
      return { status: 403, error: `${shown} is not allowed` }
    }
    if (isBlocked(flowId)) {
      return { status: 403, error: `${shown} is blocked` }
    }
    return undefined
  }

  return {
    /**
     * Judge a start request. `flowId` is the flow it resolves to (the raw
     * `wfid` when nothing resolves or there is no resolver); `resolvedId` is
     * set only when a resolver named the flow.
     */
    async start(wfid: string): Promise<{ flowId: string; resolvedId?: string; refusal?: Refusal }> {
      if (!resolve) {
        if (listsSet && /[%?]/u.test(wfid)) {
          // The router would rewrite this id (decode / strip a query) — it
          // could reach a listed flow under a spelling the lists don't contain.
          return { flowId: wfid, refusal: { status: 400, error: 'Invalid workflow ID' } }
        }
        return { flowId: wfid, refusal: judge(wfid, `Workflow '${wfid}'`) }
      }
      const resolvedId = await resolve(wfid)
      if (resolvedId === undefined) {
        // Nothing would run — and nothing unresolvable can be judged.
        return listsSet
          ? { flowId: wfid, refusal: { status: 404, error: `Workflow '${wfid}' not found` } }
          : { flowId: wfid }
      }
      return { flowId: resolvedId, resolvedId, refusal: judge(resolvedId, `Workflow '${wfid}'`) }
    },
    /** Judge a resume of a stored state's `schemaId`. */
    resume(schemaId: string): Refusal | undefined {
      return judge(schemaId, 'Workflow')
    },
  }
}

/** BLOCK with a resolver: canon(e) ∪ canon(flowOf(e)) for every entry, this request. */
async function blockedFlows(entries: string[], resolve: Resolve): Promise<Set<string>> {
  const resolved = await Promise.all(entries.map((entry) => resolve(entry)))
  const denied = new Set<string>()
  for (const [i, entry] of entries.entries()) {
    denied.add(normalizeWfId(entry))
    const flow = resolved[i]
    if (flow === undefined) {
      warnOnce(
        `block:${entry}`,
        `Workflow outlet trigger: block entry '${entry}' matches no registered workflow ` +
          `(it only blocks a flow registered under exactly that id).`,
      )
    } else {
      denied.add(normalizeWfId(flow))
    }
  }
  return denied
}

const checkedAllowEntries = new Set<string>()

/**
 * ALLOW never uses resolution to admit; resolution only flags a likely
 * mistake. Each entry is checked once per process (bounded).
 */
async function warnOnUnregisteredAllowEntries(entries: string[], resolve: Resolve) {
  for (const entry of entries) {
    if (checkedAllowEntries.has(entry) || checkedAllowEntries.size >= 256) {
      continue
    }
    checkedAllowEntries.add(entry)
    const flow = await resolve(entry)
    if (flow === undefined || normalizeWfId(flow) !== normalizeWfId(entry)) {
      const runs = flow === undefined ? '' : ` (a request for it runs '${flow}')`
      warnOnce(
        `allow:${entry}`,
        `Workflow outlet trigger: allow entry '${entry}' is not a registered flow id${runs}` +
          ` — it admits only a flow registered as exactly '${entry}'.`,
      )
    }
  }
}

/** Fallback comparison key for `block`: leading/trailing slashes dropped, lower-cased. */
function foldWfId(id: string): string {
  return normalizeWfId(id).replace(/\/+$/u, '').toLowerCase()
}

const fallbackMatchers = new Map<string, (flowId: string) => boolean>()

/**
 * Fallback `block` matcher (no resolver). Over-matches on purpose: folded
 * literal ids, plus every entry registered as a route pattern on a
 * case-insensitive, trailing-slash-insensitive router — the router's own
 * pattern syntax, so optional, multi-param, regex and wildcard entries match
 * the ids that pattern accepts, in any case, with or without a trailing slash.
 * Cached by the entry list (independent of any app).
 */
function fallbackBlockMatcher(entries: string[]): (flowId: string) => boolean {
  const key = entries.join('\n')
  const cached = fallbackMatchers.get(key)
  if (cached) {
    return cached
  }
  const folded = new Set(entries.map(foldWfId))
  const router = new ProstoRouter<() => true>({
    silent: true,
    ignoreCase: true,
    ignoreTrailingSlash: true,
  })
  for (const entry of entries) {
    try {
      router.on('WF_BLOCK' as 'GET', `/${normalizeWfId(entry)}`, () => true)
    } catch {
      // Not a valid route pattern — the folded literal still applies.
    }
  }
  const matcher = (flowId: string) => {
    if (folded.has(foldWfId(flowId))) {
      return true
    }
    try {
      return router.lookup('WF_BLOCK' as 'GET', `/${normalizeWfId(flowId)}`) !== undefined
    } catch {
      // An entry whose pattern fails to compile — fail closed.
      return true
    }
  }
  if (fallbackMatchers.size >= 256) {
    fallbackMatchers.clear()
  }
  fallbackMatchers.set(key, matcher)
  return matcher
}
