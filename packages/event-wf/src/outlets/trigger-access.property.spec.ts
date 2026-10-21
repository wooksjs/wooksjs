/**
 * Property tests for the outlet trigger's allow/block spec (see `access.ts`).
 *
 * The oracle is computed from ground truth only: which flow `start(id)`
 * actually runs on an unrestricted app (`flowOf`), observed through a marker
 * step — never through the trigger's own resolution code.
 */
import { current } from '@wooksjs/event-core'
import { useHeaders } from '@wooksjs/event-http'
import { HandleStateStrategy, WfStateStoreMemory, outletHttp } from '@prostojs/wf/outlets'
import { beforeAll, describe, expect, it } from 'vitest'
import { Wooks } from 'wooks'
import type { TWooksHandler, TWooksOptions } from 'wooks'

import { useWfState } from '../composables'
import { createWfApp } from '../wf-adapter'
import type { WooksWf } from '../wf-adapter'

import { normalizeWfId } from '../wf-id'
import { createHttpOutlet } from './create-outlet'
import { postJson, quietLogger } from './test-utils'
import { handleWfOutletRequest } from './trigger'
import type { WfOutletTriggerConfig, WfOutletTriggerDeps } from './types'

// ---------------------------------------------------------------- space ---

const FLOW_SETS: Record<string, string[]> = {
  // static, parametric, wildcard, optional, catch-all
  mixed: ['admin', 'report', 'user/:id', 'files/*', 'opt/:x?', ':name'],
  // case-distinct ids, multi-param segment, trailing-slash id, regex param, slashed id,
  // optional param without a catch-all, wildcard inside a segment
  tricky: ['admin', 'Admin', 'a/:x-:y', 'x/', 'n/:id(\\d+)', '/slashed', 'opt/:x?', 'w/*.js'],
}
const ROUTER_OPTS: Array<TWooksOptions['router']> = [
  {},
  { ignoreCase: true },
  { ignoreTrailingSlash: true },
  { ignoreCase: true, ignoreTrailingSlash: true },
]
type NotFound = 'none' | 'to-admin' | 'throws'
const NOT_FOUND: NotFound[] = ['none', 'to-admin', 'throws']

/** List entries: registered ids, instances, typos, case/slash/encoded variants. */
const ENTRY_POOL = [
  'admin',
  'ADMIN',
  '/admin',
  'admin/',
  'adm%69n',
  'Admin',
  'report',
  'reprot',
  'zzz',
  'user/:id',
  'user/42',
  'files/*',
  'files/a',
  'opt/:x?',
  'opt',
  ':name',
  'a/:x-:y',
  'a/1-2',
  'x',
  'x/',
  'n/:id(\\d+)',
  'n/5',
  'slashed',
  '/slashed',
  'w/*.js',
  'w/a.js',
]
/** Request ids: same pools plus encodings / query suffixes. */
const REQUEST_POOL = [
  'admin',
  'ADMIN',
  'Admin',
  '/admin',
  'admin/',
  'adm%69n',
  'admin?x',
  '%61dmin',
  'report',
  'reprot',
  'zzz',
  'user/42',
  'user/:id',
  'files/a',
  'files/a/b',
  'opt',
  'opt/1',
  'OPT',
  'a/1-2',
  'x',
  'x/',
  'n/5',
  'n/abc',
  'slashed',
  '/slashed',
  'w/a.js',
  'W/A.JS',
]

/** Stored schemaIds for resumes of states persisted directly (not minted by the trigger). */
const SCHEMA_POOL = [
  'admin',
  'Admin',
  'ADMIN',
  '/admin',
  'admin/',
  'report',
  'old-flow',
  'user/:id',
  'user/42',
  'files/*',
  'opt/:x?',
  'opt',
  ':name',
  'a/:x-:y',
  'x/',
  'x',
  'n/:id(\\d+)',
  '/slashed',
  'slashed',
  'w/*.js',
]

// ------------------------------------------------------------ fixtures ---

const httpOutlet = createHttpOutlet()
let ran: string[] = []

interface RouterCase {
  label: string
  flows: string[]
  notFound: NotFound
  app: WooksWf<any>
  /** id → registered id of the flow `start(id)` runs (undefined: nothing runs) */
  flowOf: Map<string, string | undefined>
  /** same, ignoring onNotFound (did the router itself match?) */
  routeFlowOf: Map<string, string | undefined>
}

const NOT_FOUND_HANDLERS: Record<NotFound, TWooksHandler | undefined> = {
  none: undefined,
  'to-admin': () => ({ id: 'admin' }),
  throws: () => {
    throw new Error('no such workflow')
  },
}

function buildApp(flows: string[], router: TWooksOptions['router'], onNotFound?: TWooksHandler) {
  const app = createWfApp<any>(
    { router, onNotFound, logger: quietLogger },
    new Wooks({ router, logger: quietLogger }),
  )
  for (const [i, flow] of flows.entries()) {
    app.step(`mark-${i}`, { handler: () => void ran.push(flow) })
    app.step(`ask-${i}`, {
      handler: () => {
        ran.push(`ask:${flow}`)
        return useWfState().input() ? undefined : outletHttp({ fields: ['x'] })
      },
    })
    app.flow(flow, [`mark-${i}`, `ask-${i}`])
  }
  return app
}

async function groundTruth(app: WooksWf<any>, ids: string[]) {
  const map = new Map<string, string | undefined>()
  for (const id of ids) {
    ran = []
    try {
      await app.start(id, {})
    } catch {
      // nothing ran
    }
    map.set(id, ran[0])
  }
  return map
}

const ALL_IDS = [...new Set([...ENTRY_POOL, ...REQUEST_POOL, ...SCHEMA_POOL])]
const routers: RouterCase[] = []

/**
 * Fallback ground truth: does block entry `e`, read as a route pattern on a
 * case-/trailing-slash-insensitive router, match `id`? Observed by starting
 * `id` on an app whose only flow is `e`.
 */
const patternMatches = new Map<string, Set<string>>()

beforeAll(async () => {
  for (const entry of ENTRY_POOL) {
    const matched = new Set<string>()
    try {
      const app = buildApp([entry], { ignoreCase: true, ignoreTrailingSlash: true })
      for (const [id, f] of await groundTruth(app, ALL_IDS)) {
        if (f !== undefined) {
          matched.add(id)
        }
      }
    } catch {
      // not a valid pattern — literal only
    }
    patternMatches.set(entry, matched)
  }
  for (const [setName, flows] of Object.entries(FLOW_SETS)) {
    for (const router of ROUTER_OPTS) {
      const bare = buildApp(flows, router)
      const routeFlowOf = await groundTruth(bare, ALL_IDS)
      for (const notFound of NOT_FOUND) {
        const app =
          notFound === 'none' ? bare : buildApp(flows, router, NOT_FOUND_HANDLERS[notFound])
        const flowOf = notFound === 'none' ? routeFlowOf : await groundTruth(app, ALL_IDS)
        routers.push({
          label: `${setName} ${JSON.stringify(router)} notFound=${notFound}`,
          flows,
          notFound,
          app,
          flowOf,
          routeFlowOf,
        })
      }
    }
  }
})

function depsFor(app: WooksWf<any>, withResolver: boolean): WfOutletTriggerDeps {
  const deps: WfOutletTriggerDeps = {
    start: (s, c, o) => app.start(s, c, o as any) as any,
    resume: (s, o) => app.resume(s, o as any) as any,
  }
  if (withResolver) {
    deps.resolveSchemaId = (id, opts) => app.resolveSchemaId(id, opts as any)
  }
  return deps
}

interface Outcome {
  status: number | undefined
  body: any
  error?: string
  ran: string[]
}

async function trigger(
  config: WfOutletTriggerConfig,
  deps: WfOutletTriggerDeps,
  body: unknown,
): Promise<Outcome> {
  ran = []
  const r = await postJson(() => handleWfOutletRequest(config, deps), body)
  return { status: r.status, body: r.body, error: r.error?.message, ran }
}

// --------------------------------------------------------------- oracle ---

const canon = normalizeWfId
const fold = (id: string) => canon(id).replace(/\/+$/u, '').toLowerCase()

interface Lists {
  allow?: string[]
  block: string[]
}

/** id → the flow `start(id)` runs (ground truth). */
type FlowOf = Map<string, string | undefined>

/** Spec (with resolver): the denied flows. */
function deniedFlows(flowOf: FlowOf, block: string[]): Set<string> {
  const denied = new Set<string>()
  for (const entry of block) {
    denied.add(canon(entry))
    const f = flowOf.get(entry)
    if (f !== undefined) {
      denied.add(canon(f))
    }
  }
  return denied
}

/** Spec: is flow F (registered id) admitted? */
function specAdmits(flowOf: FlowOf, lists: Lists, flow: string): boolean {
  if (deniedFlows(flowOf, lists.block).has(canon(flow))) {
    return false
  }
  if (lists.allow === undefined) {
    return true
  }
  return lists.allow.some((entry) => canon(entry) === canon(flow))
}

/** Fallback guarantee: an entry blocks every id equal to it (folded) or matched by it as a pattern. */
function fallbackBlocked(block: string[], id: string): boolean {
  return block.some((entry) => fold(entry) === fold(id) || patternMatches.get(entry)!.has(id))
}

/** Group violations by kind (text before the first `(` or `:`) for readable failures. */
function summarize(violations: string[]) {
  const byKind: Record<string, number> = {}
  const samples: string[] = []
  for (const v of violations) {
    const kind = v.split(/[(:]/u)[0].trim()
    byKind[kind] = (byKind[kind] ?? 0) + 1
    if (byKind[kind] <= 2) {
      samples.push(v)
    }
  }
  return { total: violations.length, byKind, samples }
}

// ------------------------------------------------------------- sampling ---

/** Small deterministic PRNG (Park–Miller minimal standard). */
function rng(seed: number) {
  let a = seed % 2147483647 || 1
  return () => {
    a = (a * 48271) % 2147483647
    return (a - 1) / 2147483646
  }
}

function pick<T>(r: () => number, items: T[]): T {
  return items[Math.floor(r() * items.length)]
}

function randomLists(r: () => number): Lists {
  const allowKind = r()
  const allow =
    allowKind < 0.3
      ? undefined
      : allowKind < 0.4
        ? []
        : Array.from({ length: 1 + Math.floor(r() * 2) }, () => pick(r, ENTRY_POOL))
  const block =
    r() < 0.35 ? [] : Array.from({ length: 1 + Math.floor(r() * 2) }, () => pick(r, ENTRY_POOL))
  return { allow, block }
}

function configOf(lists: Lists, strategy: HandleStateStrategy): WfOutletTriggerConfig {
  return {
    state: strategy,
    outlets: [httpOutlet],
    ...(lists.allow === undefined ? {} : { allow: lists.allow }),
    block: lists.block,
  }
}

interface Case {
  rc: RouterCase
  lists: Lists
  /** start request id, or — for a direct resume — the stored schemaId */
  id: string
  kind: 'start' | 'resume'
}

/**
 * The bounded space, for starts (requests from REQUEST_POOL) and for resumes
 * of directly persisted states (schemaIds from SCHEMA_POOL):
 *  - every router × id × allow ∈ {omitted, [], [e] for each entry} (block empty)
 *  - every router × id × block ∈ {[e] for each entry} (allow omitted)
 *  - plus seeded random combinations with up to two allow and two block entries.
 */
function* cases(randomCount: number, seed: number): Generator<Case> {
  const allowChoices: Array<string[] | undefined> = [undefined, [], ...ENTRY_POOL.map((e) => [e])]
  for (const rc of routers) {
    for (const [kind, pool] of [
      ['start', REQUEST_POOL],
      ['resume', SCHEMA_POOL],
    ] as const) {
      for (const id of pool) {
        for (const allow of allowChoices) {
          yield { rc, id, kind, lists: { allow, block: [] } }
        }
        for (const entry of ENTRY_POOL) {
          yield { rc, id, kind, lists: { block: [entry] } }
        }
      }
    }
  }
  const r = rng(seed)
  for (let n = 0; n < randomCount; n++) {
    const kind = r() < 0.7 ? 'start' : 'resume'
    const id = pick(r, kind === 'start' ? REQUEST_POOL : SCHEMA_POOL)
    yield { rc: pick(r, routers), id, kind, lists: randomLists(r) }
  }
}

const RANDOM_CASES = 5000

function tagOf(c: Case, flow: string | undefined) {
  return `${c.kind} ${c.rc.label} ${JSON.stringify(c.lists)} id=${JSON.stringify(c.id)} flow=${flow}`
}

/** Start `wfid`; also resume a token for the same flow minted on an unrestricted trigger. */
async function checkStart(c: Case, withResolver: boolean, violations: string[]) {
  const { rc, lists, id: wfid } = c
  const deps = depsFor(rc.app, withResolver)
  const strategy = new HandleStateStrategy({ store: new WfStateStoreMemory() })
  const config = configOf(lists, strategy)
  const flow = rc.flowOf.get(wfid)
  const tag = tagOf(c, flow)
  const listsSet = lists.allow !== undefined || lists.block.length > 0

  const started = await trigger(config, deps, { wfid })
  const ranFlow = started.ran[0]
  if (ranFlow !== undefined && ranFlow !== flow) {
    violations.push(`ran a different flow than flowOf (${ranFlow}): ${tag}`)
  }

  let resumed: Outcome | undefined
  if (flow !== undefined) {
    const minted = await trigger({ state: strategy, outlets: [httpOutlet] }, deps, { wfid })
    resumed = await trigger(config, deps, { wfs: minted.body?.wfs, input: { x: 1 } })
  }
  const resumeAdmitted = resumed?.body?.finished === true

  if (withResolver) {
    if (flow === undefined) {
      if (listsSet && started.status !== 404) {
        violations.push(`unresolvable start not refused with 404 (${started.status}): ${tag}`)
      }
      return
    }
    const admitted = specAdmits(rc.flowOf, lists, flow)
    if (admitted && ranFlow !== flow) {
      violations.push(
        `admitted flow did not run (${started.status} ${started.error ?? JSON.stringify(started.body)}): ${tag}`,
      )
    }
    if (!admitted && ranFlow !== undefined) {
      violations.push(`refused flow ran: ${tag}`)
    }
    if (resumeAdmitted !== admitted) {
      violations.push(
        `resume ${resumeAdmitted ? 'admitted' : 'refused'} but spec ${admitted ? 'admits' : 'refuses'} (${resumed?.status} ${resumed?.error ?? JSON.stringify(resumed?.body)}): ${tag}`,
      )
    }
    return
  }

  // Fallback (no resolver): the documented guarantees.
  if (listsSet && /[%?]/u.test(wfid)) {
    if (started.status !== 400) {
      violations.push(`expected 400 for a %/? spelling: ${tag}`)
    }
    return
  }
  if (fallbackBlocked(lists.block, wfid) && ![400, 403].includes(started.status ?? 0)) {
    violations.push(
      `fallback block entry did not refuse the request id (${started.status}): ${tag}`,
    )
  }
  if (
    ranFlow !== undefined &&
    lists.allow !== undefined &&
    !lists.allow.some((e) => canon(e) === canon(wfid))
  ) {
    violations.push(`ran although the request id is not in allow: ${tag}`)
  }
  if (flow !== undefined && resumeAdmitted) {
    if (fallbackBlocked(lists.block, flow)) {
      violations.push(`fallback-blocked flow resumed: ${tag}`)
    }
    if (lists.allow !== undefined && !lists.allow.some((e) => canon(e) === canon(flow))) {
      violations.push(`resume admitted a flow not in allow: ${tag}`)
    }
  }
}

/**
 * Resume a state persisted directly with `schemaId` (stale, case-/slash-variant,
 * instance ids…). Only the flow registered under exactly that id — or, failing
 * that, equal up to leading slashes — may run; never via routing or onNotFound.
 */
async function checkDirectResume(c: Case, withResolver: boolean, violations: string[]) {
  const { rc, lists, id: schemaId } = c
  const deps = depsFor(rc.app, withResolver)
  const strategy = new HandleStateStrategy({ store: new WfStateStoreMemory() })
  const config = configOf(lists, strategy)
  // Exact registered id, else the first registered id equal up to leading slashes.
  const registered = rc.flows.includes(schemaId)
    ? schemaId
    : rc.flows.find((f) => canon(f) === canon(schemaId))
  const tag = tagOf(c, registered)

  const handle = await strategy.persist({ schemaId, indexes: [1], context: {} })
  const resumed = await trigger(config, deps, { wfs: `default.${handle}`, input: { x: 1 } })
  const ranFlows = resumed.ran.filter((r) => r.startsWith('ask:')).map((r) => r.slice(4))

  if (registered === undefined) {
    if (ranFlows.length > 0) {
      violations.push(`resume of an unregistered schemaId ran ${ranFlows[0]}: ${tag}`)
    }
    return
  }
  if (ranFlows.some((f) => f !== registered)) {
    violations.push(`resume ran another flow (${ranFlows.join(',')}): ${tag}`)
  }
  const ran = ranFlows.includes(registered)
  if (withResolver) {
    const admitted = specAdmits(rc.flowOf, lists, registered)
    if (admitted !== ran) {
      violations.push(
        `direct resume ${ran ? 'ran' : 'did not run'} but spec ${admitted ? 'admits' : 'refuses'} (${resumed.status} ${resumed.error ?? JSON.stringify(resumed.body)}): ${tag}`,
      )
    }
    return
  }
  if (ran && fallbackBlocked(lists.block, registered)) {
    violations.push(`fallback-blocked flow resumed: ${tag}`)
  }
  if (
    ran &&
    lists.allow !== undefined &&
    !lists.allow.some((e) => canon(e) === canon(registered))
  ) {
    violations.push(`resume admitted a flow not in allow: ${tag}`)
  }
}

describe('outlet trigger — allow/block property', () => {
  for (const withResolver of [true, false]) {
    it(`${withResolver ? 'with' : 'without'} resolver: bounded space + ${RANDOM_CASES} seeded cases, 0 violations`, async () => {
      const violations: string[] = []
      let count = 0
      for (const c of cases(RANDOM_CASES, withResolver ? 0xa11 : 0xb10c)) {
        count++
        await (c.kind === 'start' ? checkStart : checkDirectResume)(c, withResolver, violations)
      }
      // routers × (requests + schemaIds) × (allow choices + block choices) + random
      expect(count).toBe(
        routers.length *
          (REQUEST_POOL.length + SCHEMA_POOL.length) *
          (ENTRY_POOL.length + 2 + ENTRY_POOL.length) +
          RANDOM_CASES,
      )
      expect(summarize(violations)).toEqual({ total: 0, byKind: {}, samples: [] })
    }, 120_000)
  }
})

// ------------------------------------------- request-dependent onNotFound ---

/**
 * A request-dependent onNotFound: the `x-flow` header names the flow an
 * unroutable id runs. Every `block` entry is resolved per request, so each
 * list config is exercised by two requests with different headers through one
 * deps object, in both orders — every verdict must match the spec computed
 * from header-aware ground truth.
 */
describe('outlet trigger — request-dependent onNotFound is judged per request', () => {
  const HEADER_FLOWS: Record<string, [string, string]> = {
    mixed: ['admin', 'report'],
    tricky: ['admin', '/slashed'],
  }

  interface HeaderRouter {
    label: string
    app: WooksWf<any>
    headers: [string, string]
    /** header → id → flow that runs */
    flowOf: Map<string, FlowOf>
  }
  const headerRouters: HeaderRouter[] = []

  const headerNotFound = (flows: string[]) => () => {
    const header = useHeaders()['x-flow'] as string | undefined
    if (header && flows.includes(header)) {
      return { id: header }
    }
    throw new Error('no such workflow')
  }

  const inRequest = (header: string, fn: () => Promise<unknown>, body: unknown = {}) =>
    postJson(fn, body, { 'x-flow': header })

  beforeAll(async () => {
    for (const [setName, flows] of Object.entries(FLOW_SETS)) {
      for (const router of [{}, { ignoreCase: true }]) {
        const app = buildApp(flows, router, headerNotFound(flows))
        const headers = HEADER_FLOWS[setName]
        const flowOf = new Map<string, FlowOf>()
        for (const header of headers) {
          const map: FlowOf = new Map()
          for (const id of ALL_IDS) {
            ran = []
            await inRequest(header, () => app.start(id, {}, { eventContext: current() }))
            map.set(id, ran[0])
          }
          flowOf.set(header, map)
        }
        headerRouters.push({ label: `${setName} ${JSON.stringify(router)}`, app, headers, flowOf })
      }
    }
  })

  function expected(hr: HeaderRouter, header: string, lists: Lists, wfid: string) {
    const flowOf = hr.flowOf.get(header)!
    const flow = flowOf.get(wfid)
    if (flow === undefined) {
      return lists.allow !== undefined || lists.block.length > 0 ? 'refused' : 'nothing'
    }
    return specAdmits(flowOf, lists, flow) ? flow : 'refused'
  }

  it('both header orders through one deps object: 0 violations', async () => {
    const lists: Lists[] = [
      { block: [] },
      ...ENTRY_POOL.map((e) => ({ block: [e] })),
      ...ENTRY_POOL.map((e) => ({ allow: [e], block: [] })),
    ]
    const violations: string[] = []
    let count = 0
    for (const hr of headerRouters) {
      const deps = depsFor(hr.app, true)
      for (const list of lists) {
        for (const wfid of REQUEST_POOL) {
          for (const order of [hr.headers, [hr.headers[1], hr.headers[0]]]) {
            for (const header of order) {
              count++
              const config = configOf(
                list,
                new HandleStateStrategy({ store: new WfStateStoreMemory() }),
              )
              ran = []
              await inRequest(header, () => handleWfOutletRequest(config, deps), { wfid })
              const want = expected(hr, header, list, wfid)
              const got = ran[0] ?? (want === 'nothing' ? 'nothing' : 'refused')
              if (got !== want) {
                violations.push(
                  `order ${order.join('>')} header=${header}: ran ${got}, spec ${want}: ${hr.label} ${JSON.stringify(list)} wfid=${wfid}`,
                )
              }
            }
          }
        }
      }
    }
    expect(count).toBe(headerRouters.length * lists.length * REQUEST_POOL.length * 4)
    expect(summarize(violations)).toEqual({ total: 0, byKind: {}, samples: [] })
  }, 120_000)
})
