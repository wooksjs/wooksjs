import { ProstoRouter } from '@prostojs/router'

import { normalizeWfId } from '../wf-id'

import type { WfRefusal } from './errors'
import type { WfOutletTriggerConfig, WfStartRunner } from './types'
import { warnOnce } from './warn-once'

/*
 * ─── Outlet trigger access spec (allow / resumeOnly / block) ─────────────
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
 * RESUME-ONLY — flows that may be resumed but never started. Each side
 *         follows the rule of the list it acts like (entries are resolved on
 *         every START, in that request's context; a resume resolves none):
 *           start  — refused like BLOCK (canon(e) ∪ canon(flowOf(e)), reason
 *                    'not-allowed'), even when `allow` lists the flow too;
 *           resume — admitted like ALLOW (canon(e) only, never by
 *                    resolution), in addition to `allow`.
 *         An entry that is not a registered id warns once.
 *
 *   flow F            start               resume
 *   in block          refused (any list)  refused (any list)
 *   in resumeOnly     refused             admitted
 *   in allow          admitted            admitted
 *   in neither        admitted only when `allow` is omitted (both)
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
 *     RESUME-ONLY refuses a start the same way;
 *   - ALLOW is exact on canon(wfid) at start and canon(schemaId) at resume;
 *     RESUME-ONLY admits a resume the same way.
 *   The fallback cannot see `onNotFound`, and at start `allow` judges the
 *   request spelling, not the flow it runs.
 */

/** `flowOf(id)` bound to the request context; a throwing resolution counts as unresolved. */
type Resolve = (id: string) => Promise<string | undefined>

/**
 * `flowOf` for one request, from `deps.resolveSchemaId` (`undefined` without one): resolution
 * runs with `eventContext` as `start()` gets it, and a throwing resolution counts as unresolved.
 * Shared by the trigger and `mintWfToken`, so both pick the same flow (and default strategy).
 */
export function createResolver(
  deps: Pick<WfStartRunner, 'resolveSchemaId'>,
  eventContext: unknown,
): Resolve | undefined {
  const resolveSchemaId = deps.resolveSchemaId
  if (!resolveSchemaId) {
    return undefined
  }
  return async (id) => {
    try {
      return await resolveSchemaId.call(deps, id, { eventContext })
    } catch {
      return undefined
    }
  }
}

/** The message of a `WF_FORBIDDEN` refusal, by reason. */
const FORBIDDEN_MSG = { 'not-allowed': 'is not allowed', blocked: 'is blocked' } as const

/** Whether `allow` / `resumeOnly` / `block` restrict this trigger at all. */
export function hasAccessLists(config: WfOutletTriggerConfig): boolean {
  return (
    config.allow !== undefined ||
    (config.resumeOnly?.length ?? 0) > 0 ||
    (config.block?.length ?? 0) > 0
  )
}

const neverBlocked = (_flowId: string) => false

/** `allow` / `resumeOnly` entries admit context-free — canonicalise each array once. */
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
 * Build the allow/resumeOnly/block decision for one trigger request (see the spec above).
 * `eventContext` is the parent `start()` will get, so a context-aware
 * `onNotFound` resolves exactly as it would run.
 */
export async function createWfAccess(
  config: WfOutletTriggerConfig,
  deps: Pick<WfStartRunner, 'resolveSchemaId'>,
  eventContext?: unknown,
) {
  const allow = config.allow && allowSetOf(config.allow)
  const resumeOnlyEntries = config.resumeOnly ?? []
  const resumeOnly = resumeOnlyEntries.length > 0 ? allowSetOf(resumeOnlyEntries) : undefined
  const blockEntries = config.block ?? []
  const listsSet = hasAccessLists(config)
  const resolve = createResolver(deps, eventContext)

  if (resolve) {
    if (config.allow) {
      await warnOnUnregisteredEntries('allow', config.allow, resolve)
    }
  } else if (listsSet) {
    warnOnce(
      'no-resolver',
      'Workflow outlet trigger has access lists (allow/resumeOnly/block) but no ' +
        'deps.resolveSchemaId — ids cannot be resolved to registered flows, so the lists ' +
        'cannot be guaranteed. ' +
        'Use createOutletHandler(wfApp) or pass resolveSchemaId.',
    )
  }
  const isBlocked =
    blockEntries.length > 0
      ? await flowMatcher(blockEntries, resolve, warnUnmatchedBlock)
      : neverBlocked
  if (resolve && resumeOnly) {
    await warnOnUnregisteredEntries('resumeOnly', resumeOnlyEntries, resolve)
  }
  /** The `resumeOnly` start check (matched like `block`) — built on start only. */
  const startDenied = resumeOnly
    ? () => flowMatcher(resumeOnlyEntries, resolve)
    : async () => neverBlocked

  /** `wfid` is shown (message + params) on start only — a resume never names the stored flow. */
  const forbidden = (reason: keyof typeof FORBIDDEN_MSG, wfid?: string): WfRefusal => ({
    code: 'WF_FORBIDDEN',
    message: `${wfid === undefined ? 'Workflow' : `Workflow '${wfid}'`} ${FORBIDDEN_MSG[reason]}`,
    params: wfid === undefined ? { reason } : { wfid, reason },
  })
  const notAllowed = (canon: string) => allow !== undefined && !allow.has(canon)

  /** A start: `block` wins (in the reason too); `resumeOnly` refuses, even when `allow` lists it. */
  const judgeStart = async (flowId: string, wfid: string): Promise<WfRefusal | undefined> => {
    const notStartable = await startDenied()
    if (isBlocked(flowId)) {
      return forbidden('blocked', wfid)
    }
    return notStartable(flowId) || notAllowed(normalizeWfId(flowId))
      ? forbidden('not-allowed', wfid)
      : undefined
  }

  return {
    /**
     * Judge a start request. `flowId` is the flow it resolves to (the raw
     * `wfid` when nothing resolves or there is no resolver); `resolvedId` is
     * set only when a resolver named the flow.
     */
    async start(
      wfid: string,
    ): Promise<{ flowId: string; resolvedId?: string; refusal?: WfRefusal }> {
      if (!resolve) {
        if (listsSet && /[%?]/u.test(wfid)) {
          // The router would rewrite this id (decode / strip a query) — it
          // could reach a listed flow under a spelling the lists don't contain.
          return { flowId: wfid, refusal: { code: 'WF_INVALID' } }
        }
        return { flowId: wfid, refusal: await judgeStart(wfid, wfid) }
      }
      const resolvedId = await resolve(wfid)
      if (resolvedId === undefined) {
        // Nothing would run — and nothing unresolvable can be judged.
        return listsSet
          ? {
              flowId: wfid,
              refusal: {
                code: 'WF_NOT_FOUND',
                message: `Workflow '${wfid}' not found`,
                params: { wfid },
              },
            }
          : { flowId: wfid }
      }
      return { flowId: resolvedId, resolvedId, refusal: await judgeStart(resolvedId, wfid) }
    },
    /** Judge a resume of a stored state's `schemaId`: `resumeOnly` admits, like `allow`. */
    resume(schemaId: string): WfRefusal | undefined {
      if (isBlocked(schemaId)) {
        return forbidden('blocked')
      }
      const canon = normalizeWfId(schemaId)
      return notAllowed(canon) && !resumeOnly?.has(canon) ? forbidden('not-allowed') : undefined
    },
  }
}

/**
 * BLOCK-style match: with a resolver, canon(e) ∪ canon(flowOf(e)) for every entry, this request
 * (`onUnresolved` per unresolved e); without one, the fallback matcher.
 */
async function flowMatcher(
  entries: string[],
  resolve: Resolve | undefined,
  onUnresolved?: (entry: string) => void,
): Promise<(flowId: string) => boolean> {
  if (!resolve) {
    return fallbackBlockMatcher(entries)
  }
  const resolved = await Promise.all(entries.map((entry) => resolve(entry)))
  const denied = new Set<string>()
  for (const [i, entry] of entries.entries()) {
    denied.add(normalizeWfId(entry))
    const flow = resolved[i]
    if (flow === undefined) {
      onUnresolved?.(entry)
    } else {
      denied.add(normalizeWfId(flow))
    }
  }
  return (flowId) => denied.has(normalizeWfId(flowId))
}

function warnUnmatchedBlock(entry: string) {
  warnOnce(
    `block:${entry}`,
    `Workflow outlet trigger: block entry '${entry}' matches no registered workflow ` +
      `(it only blocks a flow registered under exactly that id).`,
  )
}

const checkedEntries = new Set<string>()

/**
 * ALLOW / RESUME-ONLY never use resolution to admit; resolution only flags a
 * likely mistake. Each entry is checked once per process (bounded).
 */
async function warnOnUnregisteredEntries(
  list: 'allow' | 'resumeOnly',
  entries: string[],
  resolve: Resolve,
) {
  const admits = list === 'allow' ? 'admits' : 'admits a resume of'
  for (const entry of entries) {
    const key = `${list}:${entry}`
    if (checkedEntries.has(key) || checkedEntries.size >= 256) {
      continue
    }
    checkedEntries.add(key)
    const flow = await resolve(entry)
    if (flow === undefined || normalizeWfId(flow) !== normalizeWfId(entry)) {
      const runs = flow === undefined ? '' : ` (a request for it runs '${flow}')`
      warnOnce(
        key,
        `Workflow outlet trigger: ${list} entry '${entry}' is not a registered flow id${runs}` +
          ` — it ${admits} only a flow registered as exactly '${entry}'.`,
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
