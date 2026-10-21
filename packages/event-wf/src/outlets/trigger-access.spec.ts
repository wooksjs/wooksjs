import { useHeaders } from '@wooksjs/event-http'
import { HandleStateStrategy, WfStateStoreMemory, outletHttp } from '@prostojs/wf/outlets'
import type { WfState, WfStateStrategy } from '@prostojs/wf/outlets'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGlobalWooks, Wooks } from 'wooks'
import type { TWooksOptions } from 'wooks'

import { useWfState } from '../composables'
import { createWfApp } from '../wf-adapter'
import type { TWooksWfOptions, WooksWf } from '../wf-adapter'

import { createOutletHandler } from './create-handler'
import { createHttpOutlet } from './create-outlet'
import { normalizeWfId } from '../wf-id'
import { postJson, quietLogger } from './test-utils'
import type { PostResult } from './test-utils'
import { handleWfOutletRequest } from './trigger'
import type { WfOutletTriggerConfig, WfOutletTriggerDeps } from './types'

// Step/flow ids live on a process-global router — reset it per test.
beforeEach(() => clearGlobalWooks())

const httpOutlet = createHttpOutlet()

/** Flows whose first step ran, in order — proves which flow a request started. */
let ran: string[] = []
beforeEach(() => {
  ran = []
})

/**
 * Real WooksWf app: every flow runs a `mark` step (records the flow id in `ran`)
 * and then pauses once on an HTTP outlet; resuming with input finishes it.
 */
function createApp(
  flows: string[],
  router?: TWooksOptions['router'],
  wfOpts: TWooksWfOptions = {},
): WooksWf<any> {
  const app = router
    ? createWfApp<any>({ ...wfOpts, router }, new Wooks({ router, logger: quietLogger }))
    : createWfApp<any>(wfOpts)
  for (const [i, flow] of flows.entries()) {
    app.step(`mark-${i}`, { handler: () => void ran.push(flow) })
    app.step(`ask-${i}`, {
      handler: () => (useWfState().input() ? undefined : outletHttp({ fields: ['x'] })),
    })
    app.flow(flow, [`mark-${i}`, `ask-${i}`])
  }
  return app
}

/** Deps as `createOutletHandler(app)` builds them: start, resume, resolveSchemaId. */
function makeDeps(app: WooksWf<any>): WfOutletTriggerDeps {
  return {
    start: (schemaId, context, opts) => app.start(schemaId, context, opts as any) as any,
    resume: (state, opts) => app.resume(state, opts as any) as any,
    resolveSchemaId: (wfid, opts) => app.resolveSchemaId(wfid, opts as any),
  }
}

/** Custom deps without a resolver — the trigger's conservative fallback. */
function bareDeps(app: WooksWf<any>): WfOutletTriggerDeps {
  const { start, resume } = makeDeps(app)
  return { start, resume }
}

function call(
  config: WfOutletTriggerConfig,
  deps: WfOutletTriggerDeps,
  body: unknown,
  headers?: Record<string, string>,
): Promise<PostResult> {
  return postJson(() => handleWfOutletRequest(config, deps), body, headers)
}

function cfg0(overrides?: Partial<WfOutletTriggerConfig>): WfOutletTriggerConfig {
  return { state: freshStrategy(), outlets: [httpOutlet], ...overrides }
}

function freshStrategy() {
  return new HandleStateStrategy({ store: new WfStateStoreMemory() })
}

const DEFAULT_FLOWS = ['simple', 'paused', 'public-flow']

/** Shared state store so a token minted on one trigger can be replayed on another. */
function setup(
  flows: string[] = DEFAULT_FLOWS,
  router?: TWooksOptions['router'],
  wfOpts?: TWooksWfOptions,
) {
  const app = createApp(flows, router, wfOpts)
  const deps = makeDeps(app)
  const store = new WfStateStoreMemory()
  const strategy = new HandleStateStrategy({ store })
  const cfg = (overrides?: Partial<WfOutletTriggerConfig>): WfOutletTriggerConfig => ({
    state: strategy,
    outlets: [httpOutlet],
    ...overrides,
  })
  const open = cfg()
  async function mint(wfid: string): Promise<string> {
    const r = await call(open, deps, { wfid })
    expect(typeof r.body?.wfs).toBe('string')
    ran = []
    return r.body.wfs as string
  }
  return { app, deps, store, strategy, cfg, open, mint }
}

describe('outlet trigger — allow/block on resume', () => {
  it('rejects resume of a workflow that is not in `allow` (403), without consuming the token', async () => {
    const { deps, cfg, open, mint } = setup()
    // Token minted by a public flow, replayed on a trigger that only allows another flow.
    const token = await mint('public-flow')

    const refused = await call(cfg({ allow: ['simple'] }), deps, { wfs: token, input: { x: 1 } })
    expect(refused.status).toBe(403)
    expect(refused.body.error).toBeDefined()
    expect(refused.body.finished).toBeUndefined()

    // Not consumed — the token still works on the correct trigger.
    const ok = await call(open, deps, { wfs: token, input: { x: 1 } })
    expect(ok.error).toBeUndefined()
    expect(ok.body).toEqual({ finished: true })
  })

  it('rejects resume of a blocked workflow (403), without consuming the token', async () => {
    const { deps, cfg, open, mint } = setup()
    const token = await mint('paused')

    const refused = await call(cfg({ block: ['paused'] }), deps, { wfs: token, input: { x: 1 } })
    expect(refused.status).toBe(403)
    expect(refused.body.finished).toBeUndefined()

    const ok = await call(open, deps, { wfs: token, input: { x: 1 } })
    expect(ok.body).toEqual({ finished: true })
  })

  it('never consumes on a refused resume, and never runs the step', async () => {
    const { deps, cfg, strategy, mint } = setup()
    const token = await mint('paused')
    const consume = vi.spyOn(strategy, 'consumeEntry')
    const resume = vi.spyOn(deps, 'resume')

    const refused = await call(cfg({ block: ['paused'] }), deps, { wfs: token, input: { x: 1 } })
    expect(refused.status).toBe(403)
    expect(consume).not.toHaveBeenCalled()
    expect(resume).not.toHaveBeenCalled()
  })

  it('allows resume of an allowed workflow and consumes it once', async () => {
    const { deps, cfg, strategy, mint } = setup()
    const token = await mint('paused')
    const consume = vi.spyOn(strategy, 'consumeEntry')

    const ok = await call(cfg({ allow: ['paused'] }), deps, { wfs: token, input: { x: 1 } })
    expect(ok.body).toEqual({ finished: true })
    expect(consume).toHaveBeenCalledTimes(1)

    // Finished → handle is gone.
    const again = await call(cfg({ allow: ['paused'] }), deps, { wfs: token, input: { x: 1 } })
    expect(again.status).toBe(410)
  })

  it('returns 410 for an unknown token without consulting allow/block', async () => {
    const { deps, cfg } = setup()
    const r = await call(cfg({ allow: ['paused'] }), deps, { wfs: 'default.nope' })
    expect(r.status).toBe(410)
  })

  it('re-checks the consumed state (a state swapped between retrieve and consume is refused)', async () => {
    const { deps } = setup()
    const allowed: WfState = { schemaId: 'paused', indexes: [0], context: {} }
    const blocked: WfState = { schemaId: 'admin-setup', indexes: [0], context: {} }
    const racy: WfStateStrategy = {
      persist: async () => 'h',
      retrieve: async () => allowed,
      consume: async () => blocked,
    }
    const resume = vi.spyOn(deps, 'resume')
    const r = await call({ state: racy, outlets: [httpOutlet], block: ['admin-setup'] }, deps, {
      wfs: 'default.h',
      input: { x: 1 },
    })
    expect(r.status).toBe(403)
    expect(resume).not.toHaveBeenCalled()
  })

  it('returns 410 when the handle is consumed between retrieve and consume', async () => {
    const { deps } = setup()
    const state: WfState = { schemaId: 'paused', indexes: [0], context: {} }
    const racy: WfStateStrategy = {
      persist: async () => 'h',
      retrieve: async () => state,
      consume: async () => null,
    }
    const r = await call({ state: racy, outlets: [httpOutlet] }, deps, { wfs: 'default.h' })
    expect(r.status).toBe(410)
  })
})

describe('outlet trigger — start is checked against the resolved registered flow', () => {
  // Spellings the workflow router resolves to the `simple` flow.
  const resolvingVariants = ['/simple', '//simple', 'simp%6Ce', 'simple?x=1']
  // Spellings the default (case-sensitive, strict-slash) router does NOT resolve.
  const unresolvedVariants = ['simple/', '/simple/', 'SIMPLE', 'Simple']

  it.each(resolvingVariants)(
    'block: ["simple"] rejects start with wfid %j (403, flow not run)',
    async (wfid) => {
      const { deps, cfg } = setup()
      const start = vi.spyOn(deps, 'start')
      const r = await call(cfg({ block: ['simple'] }), deps, { wfid })
      expect(r.status).toBe(403)
      expect(start).not.toHaveBeenCalled()
      expect(ran).toEqual([])
    },
  )

  it.each(unresolvedVariants)(
    'block: ["simple"] — wfid %j resolves to no flow: refused with 404 while lists are set',
    async (wfid) => {
      const { deps, cfg } = setup()
      const start = vi.spyOn(deps, 'start')
      const r = await call(cfg({ block: ['simple'] }), deps, { wfid })
      expect(r.status).toBe(404)
      expect(start).not.toHaveBeenCalled()
      expect(ran).toEqual([])
    },
  )

  it.each([
    ...resolvingVariants.map((wfid) => [wfid, 403] as const),
    ...unresolvedVariants.map((wfid) => [wfid, 404] as const),
  ])('allow: ["other"] rejects start with wfid %j (%i)', async (wfid, status) => {
    const { deps, cfg } = setup()
    const start = vi.spyOn(deps, 'start')
    const r = await call(cfg({ allow: ['other'] }), deps, { wfid })
    expect(r.status).toBe(status)
    expect(start).not.toHaveBeenCalled()
  })

  it('without lists, an unknown wfid still reaches start() (unknown-flow error as before)', async () => {
    const { deps, cfg } = setup()
    const r = await call(cfg(), deps, { wfid: 'missing' })
    expect(r.error?.message).toMatch(/Unknown schemaId/)
  })

  it.each(resolvingVariants)('allow: ["simple"] lets wfid %j start the flow', async (wfid) => {
    const { deps, cfg } = setup()
    const r = await call(cfg({ allow: ['simple'] }), deps, { wfid })
    expect(r.status).not.toBe(403)
    expect(typeof r.body.wfs).toBe('string')
    expect(ran).toEqual(['simple'])
  })

  it.each(['/simple', '//simple'])(
    'list entries ignore leading slashes: block: [%j] rejects wfid "simple"',
    async (entry) => {
      const { deps, cfg } = setup()
      const r = await call(cfg({ block: [entry] }), deps, { wfid: 'simple' })
      expect(r.status).toBe(403)
    },
  )

  it.each(['simp%6Ce', 'simple?x=1'])(
    'block entries are resolved, allow entries are not: [%j] blocks flow "simple" but admits nothing',
    async (entry) => {
      const { deps, cfg } = setup()
      expect((await call(cfg({ block: [entry] }), deps, { wfid: 'simple' })).status).toBe(403)
      expect((await call(cfg({ allow: [entry] }), deps, { wfid: 'simple' })).status).toBe(403)
      expect(ran).toEqual([])
    },
  )

  it.each(['SIMPLE', 'simple/'])(
    'an entry that resolves to no flow (%j) is kept literally and warns once',
    async (entry) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const { deps, cfg } = setup()
        // Default router: neither spelling runs `simple`, so it is not blocked…
        expect((await call(cfg({ block: [entry] }), deps, { wfid: 'simple' })).status).not.toBe(403)
        await call(cfg({ block: [entry] }), deps, { wfid: 'simple' })
        // …and a request spelled like the entry resolves to nothing → 404.
        expect((await call(cfg({ block: [entry] }), deps, { wfid: entry })).status).toBe(404)
        const hits = warn.mock.calls.filter((c) => String(c[0]).includes(`'${entry}'`))
        expect(hits).toHaveLength(1)
      } finally {
        warn.mockRestore()
      }
    },
  )

  it('rejects a non-string wfid (400) instead of stringifying it past the block list', async () => {
    const { deps, cfg } = setup()
    const start = vi.spyOn(deps, 'start')
    for (const wfid of [['simple'], { toString: 'simple' }, 42]) {
      const r = await call(cfg({ block: ['simple'] }), deps, { wfid })
      expect(r.status).toBe(400)
    }
    expect(start).not.toHaveBeenCalled()
  })

  it('rejects a non-string wfs token (410)', async () => {
    const { deps, cfg, mint } = setup()
    const token = await mint('paused')
    const r = await call(cfg(), deps, { wfs: [token] })
    expect(r.status).toBe(410)
  })
})

describe('outlet trigger — resolution against a real router', () => {
  it('allow ["report"] does not let "REPORT" run the catch-all `:name` flow', async () => {
    const { deps, cfg } = setup(['report', ':name'])
    const r = await call(cfg({ allow: ['report'] }), deps, { wfid: 'REPORT' })
    expect(r.status).toBe(403)
    expect(ran).toEqual([])
  })

  it('allow ["admin"] does not start or resume the distinct flow "Admin"', async () => {
    const { deps, cfg, mint } = setup(['admin', 'Admin'])
    const config = cfg({ allow: ['admin'] })

    const started = await call(config, deps, { wfid: 'Admin' })
    expect(started.status).toBe(403)
    expect(ran).toEqual([])

    const token = await mint('Admin')
    const resumed = await call(config, deps, { wfs: token, input: { x: 1 } })
    expect(resumed.status).toBe(403)

    // The allowed flow itself still works.
    expect((await call(config, deps, { wfid: 'admin' })).status).not.toBe(403)
    expect(ran).toEqual(['admin'])
  })

  it('block ["user/:id"] blocks starting any instance (user/42) and resuming it', async () => {
    const { deps, cfg, mint } = setup(['user/:id'])
    const config = cfg({ block: ['user/:id'] })

    expect((await call(config, deps, { wfid: 'user/42' })).status).toBe(403)
    expect(ran).toEqual([])

    const token = await mint('user/42')
    expect((await call(config, deps, { wfs: token, input: { x: 1 } })).status).toBe(403)
  })

  it('block ["files/*"] blocks starting a wildcard instance', async () => {
    const { deps, cfg } = setup(['files/*'])
    for (const wfid of ['files/a', 'files/a/b', 'files/*']) {
      expect((await call(cfg({ block: ['files/*'] }), deps, { wfid })).status).toBe(403)
    }
    expect(ran).toEqual([])
  })

  it('a literal `%` in a registered id cannot be re-encoded past `block`', async () => {
    const { deps, cfg } = setup(['a%41b'])
    // The router decodes once: 'a%2541b' → 'a%41b' (the registered flow).
    expect(await deps.resolveSchemaId!('a%2541b')).toBe('a%41b')
    for (const wfid of ['a%2541b', 'a%41b', 'aAb']) {
      const r = await call(cfg({ block: ['a%41b'] }), deps, { wfid })
      expect([403, 404]).toContain(r.status)
    }
    expect(ran).toEqual([])
  })

  it('an instance entry means its flow — block ["user/42"] blocks every instance, start and resume', async () => {
    const { deps, cfg, mint } = setup(['user/:id'])
    const config = cfg({ block: ['user/42'] })
    const token42 = await mint('user/42')
    const token7 = await mint('user/7')

    expect((await call(config, deps, { wfid: 'user/42' })).status).toBe(403)
    expect((await call(config, deps, { wfid: 'user/7' })).status).toBe(403)
    expect((await call(config, deps, { wfs: token42, input: { x: 1 } })).status).toBe(403)
    expect((await call(config, deps, { wfs: token7, input: { x: 1 } })).status).toBe(403)
    expect(ran).toEqual([])
  })

  it('allow ["user/42"] admits nothing — an instance id is not a registered id (warns once)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { deps, cfg, mint } = setup(['user/:id'])
      const config = cfg({ allow: ['user/42'] })
      const token = await mint('user/42')
      expect((await call(config, deps, { wfid: 'user/42' })).status).toBe(403)
      expect((await call(config, deps, { wfid: 'user/99' })).status).toBe(403)
      expect((await call(config, deps, { wfs: token, input: { x: 1 } })).status).toBe(403)
      expect(ran).toEqual([])
      const hits = warn.mock.calls.filter((c) => String(c[0]).includes("allow entry 'user/42'"))
      expect(hits).toHaveLength(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('a typo allow entry does not admit the catch-all flow it would run', async () => {
    const { deps, cfg, mint } = setup(['report', ':name'])
    const config = cfg({ allow: ['reprot'] })
    for (const wfid of ['reprot', 'report', 'whatever']) {
      expect((await call(config, deps, { wfid })).status).toBe(403)
    }
    const token = await mint('anything')
    expect((await call(config, deps, { wfs: token, input: { x: 1 } })).status).toBe(403)
    expect(ran).toEqual([])
  })

  it('a stale allow entry does not admit a catch-all token on resume', async () => {
    const { deps, cfg, mint } = setup(['report-v2', ':name'])
    const token = await mint('anything')
    const r = await call(cfg({ allow: ['report'] }), deps, { wfs: token, input: { x: 1 } })
    expect(r.status).toBe(403)
  })

  it('ignoreCase router — block ["Admin"] means flow "admin"', async () => {
    const { deps, cfg, mint } = setup(['admin'], { ignoreCase: true })
    const config = cfg({ block: ['Admin'] })
    for (const wfid of ['admin', 'Admin', 'ADMIN']) {
      expect((await call(config, deps, { wfid })).status).toBe(403)
    }
    const token = await mint('admin')
    expect((await call(config, deps, { wfs: token, input: { x: 1 } })).status).toBe(403)
    expect(ran).toEqual([])
  })

  it('block ["adm%69n"] means flow "admin"', async () => {
    const { deps, cfg } = setup(['admin'])
    for (const wfid of ['admin', 'adm%69n', '/admin']) {
      expect((await call(cfg({ block: ['adm%69n'] }), deps, { wfid })).status).toBe(403)
    }
    expect(ran).toEqual([])
  })

  it('block ["admin/"] (runs nothing on a strict router) never lets "admin/" run a flow', async () => {
    const { deps, cfg } = setup(['admin'])
    const r = await call(cfg({ block: ['admin/'] }), deps, { wfid: 'admin/' })
    expect([403, 404]).toContain(r.status)
    expect(ran).toEqual([])
  })

  it('a flow registered as "x/" is blocked by block ["x"]', async () => {
    const { deps, cfg, mint } = setup(['x/'])
    expect(await deps.resolveSchemaId!('x')).toBe('x/')
    const config = cfg({ block: ['x'] })
    expect((await call(config, deps, { wfid: 'x' })).status).toBe(403)
    const token = await mint('x')
    expect((await call(config, deps, { wfs: token, input: { x: 1 } })).status).toBe(403)
    expect(ran).toEqual([])
  })

  it('onNotFound routing an unknown id to a blocked flow is refused', async () => {
    const { deps, cfg } = setup(['admin'], undefined, { onNotFound: () => ({ id: 'admin' }) })
    expect(await deps.resolveSchemaId!('nope')).toBe('admin')
    const r = await call(cfg({ block: ['admin'] }), deps, { wfid: 'nope' })
    expect(r.status).toBe(403)
    expect(ran).toEqual([])
  })

  it('an allow entry that only resolves via onNotFound admits nothing (warns once)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { deps, cfg } = setup(['public', 'admin'], undefined, {
        onNotFound: () => ({ id: 'admin' }),
      })
      const config = cfg({ allow: ['public', 'n4-typo'] })
      for (const wfid of ['admin', 'nope', 'n4-typo']) {
        expect((await call(config, deps, { wfid })).status).toBe(403)
      }
      expect(ran).toEqual([])
      expect((await call(config, deps, { wfid: 'public' })).status).not.toBe(403)
      expect(ran).toEqual(['public'])
      // the onNotFound target is admitted only when named literally
      ran = []
      expect((await call(cfg({ allow: ['admin'] }), deps, { wfid: 'nope' })).status).not.toBe(403)
      expect(ran).toEqual(['admin'])
      const hits = warn.mock.calls.filter((c) => String(c[0]).includes("'n4-typo'"))
      expect(hits).toHaveLength(1)
      expect(String(hits[0][0])).toMatch(/'admin'/)
    } finally {
      warn.mockRestore()
    }
  })

  it('a throwing onNotFound while resolving list entries never fails the request', async () => {
    let calls = 0
    const { deps, cfg } = setup(['public'], undefined, {
      onNotFound: () => {
        calls++
        throw new Error('no such workflow')
      },
    })
    for (const lists of [
      { allow: ['public', 'removed'] },
      { block: ['removed'] },
      { allow: ['public'], block: ['removed', 'gone'] },
    ]) {
      ran = []
      const r = await call(cfg(lists), deps, { wfid: 'public' })
      expect(r.error).toBeUndefined()
      expect(ran).toEqual(['public'])
    }
    expect(calls).toBeGreaterThan(0)
  })

  it('a context-aware onNotFound is resolved with the same schemaId start() sees', async () => {
    const { deps, cfg } = setup(['admin', 'public'], undefined, {
      onNotFound: () => {
        const id = useWfState().schemaId
        if (id.startsWith('legacy-')) {
          return { id: id.slice(7) }
        }
        throw new Error(`unknown ${id}`)
      },
    })
    expect(await deps.resolveSchemaId!('legacy-admin')).toBe('admin')
    expect((await call(cfg({ block: ['admin'] }), deps, { wfid: 'legacy-admin' })).status).toBe(403)
    expect((await call(cfg({ allow: ['public'] }), deps, { wfid: 'legacy-admin' })).status).toBe(
      403,
    )
    // an id onNotFound rejects resolves to nothing → 404 while lists are set
    expect((await call(cfg({ allow: ['public'] }), deps, { wfid: 'other' })).status).toBe(404)
    expect(ran).toEqual([])
  })

  it('onNotFound that reads request data resolves exactly as it runs (block holds)', async () => {
    const { deps, cfg } = setup(['admin', 'public'], undefined, {
      onNotFound: () => {
        let header: string | undefined
        try {
          header = useHeaders()['x-flow'] as string | undefined
        } catch {
          // outside the request — e.g. a direct resolveSchemaId() call
        }
        return { id: header === 'admin' ? 'admin' : 'public' }
      },
    })
    const withHeader = { 'x-flow': 'admin' }
    expect((await call(cfg({ block: ['admin'] }), deps, { wfid: 'nope' }, withHeader)).status).toBe(
      403,
    )
    expect(ran).toEqual([])
    // without the header the same id resolves to (and runs) `public`
    expect((await call(cfg({ block: ['admin'] }), deps, { wfid: 'nope' })).status).not.toBe(403)
    expect(ran).toEqual(['public'])
  })

  it.each([
    ['public then admin', ['public', 'admin']],
    ['admin then public', ['admin', 'public']],
  ] as const)(
    'block entries decided by a request-reading onNotFound are judged per request (%s)',
    async (_label, order) => {
      const app = createApp(['admin', 'public'], undefined, {
        onNotFound: () => {
          let header: string | undefined
          try {
            header = useHeaders()['x-flow'] as string | undefined
          } catch {
            // outside a request
          }
          return { id: header === 'admin' ? 'admin' : 'public' }
        },
      })
      const handle = createOutletHandler(app)
      const config = cfg0({ block: ['legacy'] })
      const request = async (header: string, wfid: string) =>
        (await postJson(() => handle(config), { wfid }, { 'x-flow': header })).status
      // `legacy` runs whatever the header picks, so it blocks exactly that flow.
      for (const header of order) {
        expect(await request(header, 'zzz')).toBe(403)
      }
      expect(ran).toEqual([])
      for (const header of order) {
        const other = header === 'admin' ? 'public' : 'admin'
        expect(await request(header, other)).not.toBe(403)
      }
      expect(ran.toSorted()).toEqual(['admin', 'public'])
    },
  )

  it('the judged flow is the flow that runs, even with a non-deterministic onNotFound', async () => {
    let calls = 0
    const { deps, cfg } = setup(['public', 'admin'], undefined, {
      // resolves to `public` when judged, to `admin` when start() asks again
      onNotFound: () => ({ id: calls++ % 2 === 0 ? 'public' : 'admin' }),
    })
    const r = await call(cfg({ allow: ['public'] }), deps, { wfid: 'nope' })
    expect(r.error?.message).toMatch(/resolved to 'admin', expected 'public'/)
    expect(ran).toEqual([])
  })

  it('without lists, an A/B onNotFound keeps starting even when callbacks triggered resolution', async () => {
    let calls = 0
    const { deps, cfg } = setup(['variant-a', 'variant-b'], undefined, {
      onNotFound: () => ({ id: calls++ % 2 === 0 ? 'variant-a' : 'variant-b' }),
    })
    const seen: string[] = []
    const config = cfg({
      initialContext: (_body, _wfid, flowId) => {
        seen.push(flowId)
        return {}
      },
    })
    for (let i = 0; i < 4; i++) {
      const r = await call(config, deps, { wfid: 'landing' })
      expect(r.error).toBeUndefined()
      expect(typeof r.body.wfs).toBe('string')
    }
    // every request started; the resolver's answer and the run alternate independently
    expect(ran).toHaveLength(4)
    expect(seen).toHaveLength(4)
    expect(ran).toEqual(['variant-b', 'variant-b', 'variant-b', 'variant-b'])
    expect(seen).toEqual(['variant-a', 'variant-a', 'variant-a', 'variant-a'])
  })

  it('start() refuses a flow other than expectSchemaId before running init', async () => {
    const app = createApp(['public'])
    const init = vi.fn()
    app.step('noop', { handler: () => {} })
    app.flow('other', ['noop'], undefined, init)
    await expect(app.start('other', {}, { expectSchemaId: 'public' })).rejects.toThrow(
      /expected 'public'/,
    )
    expect(init).not.toHaveBeenCalled()
    await app.start('other', {}, { expectSchemaId: 'other' })
    expect(init).toHaveBeenCalledTimes(1)
  })

  it('replacing opts.onNotFound takes effect for block entries on the next request', async () => {
    const opts: TWooksWfOptions = {}
    const app = createApp(['admin'], undefined, opts)
    const handle = createOutletHandler(app)
    const config = cfg0({ block: ['legacy'] })
    const startId = async (wfid: string) => (await postJson(() => handle(config), { wfid })).status
    // 'legacy' matches nothing and there is no onNotFound
    expect(await startId('admin')).not.toBe(403)
    expect(ran).toEqual(['admin'])
    // the app now routes unknown ids — including 'legacy' — to admin
    ;(app as unknown as { opts: TWooksWfOptions }).opts.onNotFound = () => ({ id: 'admin' })
    ran = []
    expect(await startId('zzz')).toBe(403)
    expect(await startId('admin')).toBe(403)
    expect(ran).toEqual([])
  })

  it('a flow registered with a trailing slash resumes (resume dispatches by registered id)', async () => {
    const { deps, cfg, mint } = setup(['x/'])
    const token = await mint('x')
    expect(
      (await call(cfg({ allow: ['x/'] }), deps, { wfs: token, input: { x: 1 } })).body,
    ).toEqual({
      finished: true,
    })
  })

  it('resolution runs no init and agrees with start() on shared generalized routes', async () => {
    const { app, deps, cfg } = setup(['u/:id', 'u/:name'])
    const init = vi.fn()
    app.step('noop-init', { handler: () => {} })
    app.flow('with-init', ['noop-init'], undefined, init)

    expect(await app.resolveSchemaId('with-init')).toBe('with-init')
    expect(await app.resolveSchemaId('u/1')).toBe('u/:id')
    expect(init).not.toHaveBeenCalled()

    // start runs the same flow the resolver named, and init exactly once
    await call(cfg(), deps, { wfid: 'u/1' })
    expect(ran).toEqual(['u/:id'])
    // 'u/:name' as an entry means the flow it runs — the shared route's 'u/:id'
    ran = []
    expect((await call(cfg({ block: ['u/:name'] }), deps, { wfid: 'u/2' })).status).toBe(403)
    expect(ran).toEqual([])
    await call(cfg(), deps, { wfid: 'with-init' })
    expect(init).toHaveBeenCalledTimes(1)
  })

  it('a custom WF_FLOW handler is called by the resolver (documented: must be pure)', async () => {
    const { app } = setup(['admin'])
    const custom = vi.fn(() => ({ id: 'admin' }))
    ;(app as any).on('WF_FLOW', 'side', custom)
    expect(await app.resolveSchemaId('side')).toBe('admin')
    expect(custom).toHaveBeenCalledTimes(1)
  })

  it('the default-strategy picker and initialContext get (wfid, flowId) — flowId appended', async () => {
    const { deps } = setup(['admin'])
    const picked: Array<[string, string]> = []
    const seeded: Array<[string, string]> = []
    const a = freshStrategy()
    const b = freshStrategy()
    const config: WfOutletTriggerConfig = {
      state: {
        strategies: { a, b },
        default: (wfid, flowId) => {
          picked.push([wfid, flowId])
          return flowId === 'admin' ? 'a' : 'b'
        },
      },
      outlets: [httpOutlet],
      initialContext: (_body, wfid, flowId) => {
        seeded.push([wfid, flowId])
        return {}
      },
    }
    const r = await call(config, deps, { wfid: 'adm%69n' })
    expect(picked).toEqual([['adm%69n', 'admin']])
    expect(seeded).toEqual([['adm%69n', 'admin']])
    expect(String(r.body.wfs).split('.')[0]).toBe('a')
  })

  it('allow ["user/:id"] admits every instance of the flow, on start and resume', async () => {
    const { deps, cfg, mint } = setup(['user/:id', 'other'])
    const config = cfg({ allow: ['user/:id'] })
    const token = await mint('user/99')

    expect((await call(config, deps, { wfid: 'user/42' })).status).not.toBe(403)
    expect((await call(config, deps, { wfid: 'user/:id' })).status).not.toBe(403)
    expect((await call(config, deps, { wfs: token, input: { x: 1 } })).body).toEqual({
      finished: true,
    })
    expect((await call(config, deps, { wfid: 'other' })).status).toBe(403)
  })

  it('ignoreCase router: block ["admin"] rejects every casing the router resolves to it', async () => {
    const { deps, cfg } = setup(['admin'], { ignoreCase: true, ignoreTrailingSlash: true })
    for (const wfid of ['admin', 'ADMIN', 'Admin/', 'ADM%49N']) {
      expect((await call(cfg({ block: ['admin'] }), deps, { wfid })).status).toBe(403)
    }
    expect(ran).toEqual([])
  })
})

describe('outlet trigger — deps without resolveSchemaId (fallback)', () => {
  // Custom deps: `allow` matches the raw wfid exactly (fail closed); `block`
  // over-matches (case/trailing slash folded, `:`/`*` shapes); ids with
  // `%` / `?` are refused while lists are set; a warning is logged once.
  it('does not fold case into `allow`', async () => {
    const app = createApp(['simple', 'Simple'])
    const config = cfg0({ allow: ['simple'] })
    const r = await call(config, bareDeps(app), { wfid: 'Simple' })
    expect(r.status).toBe(403)
    expect(ran).toEqual([])
  })

  it.each(['simp%6Ce', 'simple?x=1', 'simple%3F'])(
    'refuses wfid %j the router would rewrite (400) when lists are configured',
    async (wfid) => {
      const app = createApp(['simple'])
      const deps = bareDeps(app)
      const start = vi.spyOn(deps, 'start')
      for (const lists of [{ block: ['simple'] }, { allow: ['other'] }]) {
        const config = cfg0(lists)
        expect((await call(config, deps, { wfid })).status).toBe(400)
      }
      expect(start).not.toHaveBeenCalled()
      expect(ran).toEqual([])
    },
  )

  it('starts such a wfid when no lists are configured (no behaviour change)', async () => {
    const app = createApp(['simple'])
    const config = cfg0()
    const r = await call(config, bareDeps(app), { wfid: 'simp%6Ce' })
    expect(r.status).not.toBe(400)
    expect(ran).toEqual(['simple'])
  })

  it('still ignores leading slashes', async () => {
    const app = createApp(['simple'])
    const config = cfg0({ block: ['simple'] })
    const r = await call(config, bareDeps(app), { wfid: '/simple' })
    expect(r.status).toBe(403)
    expect(ran).toEqual([])
  })

  it('default router — block holds for parametric / wildcard / spelled ids', async () => {
    const app = createApp(['admin', 'user/:id', 'files/*'])
    const deps = bareDeps(app)
    const cases: Array<[Partial<WfOutletTriggerConfig>, string, number]> = [
      [{ block: ['admin'] }, '/admin', 403],
      [{ block: ['admin'] }, 'adm%69n', 400],
      [{ block: ['user/:id'] }, 'user/42', 403],
      [{ block: ['files/*'] }, 'files/a', 403],
      [{ block: ['files/*'] }, 'files/a/b', 403],
    ]
    for (const [lists, wfid, status] of cases) {
      const config = cfg0(lists)
      expect((await call(config, deps, { wfid })).status).toBe(status)
    }
    expect(ran).toEqual([])
    // allow with an exact id still works
    const ok = await call(cfg0({ allow: ['admin'] }), deps, { wfid: 'admin' })
    expect(ok.status).not.toBe(403)
    expect(ran).toEqual(['admin'])
  })

  it('ignoreCase + ignoreTrailingSlash router — block folds case and trailing slash', async () => {
    const app = createApp(['admin'], { ignoreCase: true, ignoreTrailingSlash: true })
    const deps = bareDeps(app)
    for (const wfid of ['admin/', 'ADMIN', 'Admin', 'ADMIN//']) {
      const config = cfg0({ block: ['admin'] })
      expect((await call(config, deps, { wfid })).status).toBe(403)
    }
    // allow stays exact — fails closed
    const config = cfg0({ allow: ['admin'] })
    expect((await call(config, deps, { wfid: 'ADMIN' })).status).toBe(403)
    expect(ran).toEqual([])
  })

  it('block folds on resume too', async () => {
    const app = createApp(['Admin'])
    const deps = bareDeps(app)
    const strategy = freshStrategy()
    const minted = await call({ state: strategy, outlets: [httpOutlet] }, deps, { wfid: 'Admin' })
    const config = { state: strategy, outlets: [httpOutlet], block: ['admin/'] }
    const r = await call(config, deps, { wfs: minted.body.wfs, input: { x: 1 } })
    expect(r.status).toBe(403)
  })

  it.each([
    ['user/:id?', ['user', 'user/1', 'USER/1/']],
    ['a/:x-:y', ['a/1-2', 'A/1-2']],
    ['n/:id(\\d+)', ['n/5', 'N/55/']],
    ['w/*.js', ['w/a.js', 'w/b/c.js', 'W/A.JS']],
    ['*/admin', ['x/admin', 'y/z/ADMIN']],
    ['files/*', ['files/a', 'files/a/b', 'FILES/x/']],
  ] as const)(
    'fallback block %j matches every id that route pattern accepts',
    async (entry, ids) => {
      const app = createApp([entry])
      const deps = bareDeps(app)
      for (const wfid of ids) {
        const config = cfg0({ block: [entry] })
        expect((await call(config, deps, { wfid })).status).toBe(403)
      }
      expect(ran).toEqual([])
    },
  )

  it('parametric flow + allow fails closed without a resolver', async () => {
    const app = createApp(['/user/:id'])
    const deps = bareDeps(app)
    const strategy = freshStrategy()
    // Pattern entry: the caller's instance id does not match it → start refused.
    const byPattern = { state: strategy, outlets: [httpOutlet], allow: ['user/:id'] }
    expect((await call(byPattern, deps, { wfid: 'user/42' })).status).toBe(403)
    // Instance entry: start passes, but the stored id is the pattern → resume refused.
    const byInstance = { state: strategy, outlets: [httpOutlet], allow: ['user/42'] }
    const started = await call(byInstance, deps, { wfid: 'user/42' })
    expect(typeof started.body.wfs).toBe('string')
    const resumed = await call(byInstance, deps, { wfs: started.body.wfs, input: { x: 1 } })
    expect(resumed.status).toBe(403)
  })
})

describe('WooksWf.resolveSchemaId', () => {
  it('resolves caller spellings to the registered flow id', async () => {
    const app = createApp(['simple', '/slashed', 'user/:id', 'files/*'])
    expect(await app.resolveSchemaId('simple')).toBe('simple')
    expect(await app.resolveSchemaId('/simple')).toBe('simple')
    expect(await app.resolveSchemaId('simp%6Ce')).toBe('simple')
    expect(await app.resolveSchemaId('slashed')).toBe('/slashed')
    expect(await app.resolveSchemaId('user/42')).toBe('user/:id')
    expect(await app.resolveSchemaId('files/a/b')).toBe('files/*')
    expect(await app.resolveSchemaId('missing')).toBeUndefined()
    expect(await app.resolveSchemaId('SIMPLE')).toBeUndefined()
    // Resolution runs no step.
    expect(ran).toEqual([])
  })
})

describe('normalizeWfId', () => {
  it.each([
    ['admin-setup', 'admin-setup'],
    ['/admin-setup', 'admin-setup'],
    ['//admin-setup', 'admin-setup'],
    ['/auth/login', 'auth/login'],
    // Only leading slashes — nothing else is folded.
    ['Admin-Setup', 'Admin-Setup'],
    ['admin-setup/', 'admin-setup/'],
    ['admin%2Dsetup', 'admin%2Dsetup'],
    ['user/:id', 'user/:id'],
    ['/', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeWfId(input)).toBe(expected)
  })

  it('is exported from the package entry', async () => {
    const pkg = await import('../index')
    expect(pkg.normalizeWfId).toBe(normalizeWfId)
  })
})
