import { HttpError } from '@wooksjs/event-http'
import { HandleStateStrategy, WfStateStoreMemory, outletHttp } from '@prostojs/wf/outlets'
import type { WfState } from '@prostojs/wf/outlets'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGlobalWooks } from 'wooks'

import { useWfState } from '../composables'
import { createWfApp } from '../wf-adapter'
import type { WooksWf } from '../wf-adapter'

import { createOutletHandler } from './create-handler'
import { createHttpOutlet } from './create-outlet'
import { postJson, quietLogger } from './test-utils'
import type { WfOutletTriggerConfig } from './types'
import { useWfFinished } from './use-wf-finished'

/*
 * M9 + i18n hooks on the trigger config:
 *  - `around(run)` wraps everything that touches state or side effects — consume/start/resume,
 *    persist and outlet delivery — so an app can run it in one transaction; its return value is
 *    the response; an error thrown inside propagates through it (rollback).
 *  - `beforePersist(state, pause)` runs right before a paused state is persisted (inside
 *    `around`); throwing aborts: nothing is persisted, nothing delivered.
 *  - `beforeResume(state, { strategy })` runs on a resume, after the access lists and before the
 *    token is consumed (inside `around`); throwing refuses: the token stays usable.
 *  - `renderEnvelope(envelope, info)` maps every body the trigger answers with on pause and on
 *    finish (per request), before the state token is added; never applied to errors/redirects.
 */

beforeEach(() => clearGlobalWooks())

function makeApp() {
  const app = createWfApp<Record<string, unknown>>({ logger: quietLogger })
  app.step('ask', {
    handler: () =>
      useWfState().input() ? undefined : outletHttp({ title: 'Your name' }, { hint: 'nameHint' }),
  })
  app.step('done', {
    handler: () => {
      useWfFinished().set({ type: 'data', value: { message: 'Welcome' } })
    },
  })
  app.step('go', {
    handler: () => {
      useWfFinished().set({ type: 'redirect', value: '/home' })
    },
  })
  app.step('boom', {
    handler: () => {
      throw new Error('step failed')
    },
  })
  app.flow('form', ['ask', 'done'])
  app.flow('redirect', ['go'])
  app.flow('plain', ['ask'])
  app.flow('fails', ['boom'])
  return app
}

const call = (app: WooksWf, cfg: WfOutletTriggerConfig, body: unknown) =>
  postJson(() => createOutletHandler(app)(cfg), body)

function baseConfig(store = new WfStateStoreMemory()): WfOutletTriggerConfig {
  return { state: new HandleStateStrategy({ store }), outlets: [createHttpOutlet()] }
}

describe('around', () => {
  it('wraps start + persist + deliver; its return value is the response', async () => {
    const order: string[] = []
    const store = new WfStateStoreMemory()
    const set = vi.spyOn(store, 'set')
    const cfg: WfOutletTriggerConfig = {
      ...baseConfig(store),
      around: async (run) => {
        order.push('begin')
        const out = await run()
        order.push(`commit:${set.mock.calls.length}`)
        return out
      },
    }
    const { body: result } = await call(makeApp(), cfg, { wfid: 'form' })
    expect(order).toEqual(['begin', 'commit:1']) // the state was persisted inside
    expect(result).toMatchObject({ title: 'Your name' })
  })

  it('wraps the resume (consume) as well, and errors propagate through it', async () => {
    const store = new WfStateStoreMemory()
    const cfg = baseConfig(store)
    const { body: result } = await call(makeApp(), cfg, { wfid: 'form' })
    const getAndDelete = vi.spyOn(store, 'getAndDelete')
    const seen: string[] = []
    const wrapped: WfOutletTriggerConfig = {
      ...cfg,
      around: async (run) => {
        const consumedBefore = getAndDelete.mock.calls.length
        try {
          return await run()
        } finally {
          seen.push(`consumed inside: ${getAndDelete.mock.calls.length - consumedBefore}`)
        }
      },
    }
    const resumed = await call(makeApp(), wrapped, { wfs: result!.wfs, input: { name: 'A' } })
    expect(resumed.body).toEqual({ message: 'Welcome' })
    expect(seen).toEqual(['consumed inside: 1'])

    const failing = await call(makeApp(), { ...wrapped, around: (run) => run() }, { wfid: 'fails' })
    expect(failing.error?.message).toBe('step failed')
  })

  it('refusals happen inside around too (one transaction for the whole request)', async () => {
    const around = vi.fn((run: () => Promise<unknown>) => run())
    const { error } = await call(
      makeApp(),
      { ...baseConfig(), allow: [], around },
      { wfid: 'form' },
    )
    expect(error).toMatchObject({ body: { code: 'WF_FORBIDDEN' } })
    expect(around).toHaveBeenCalledOnce()
  })
})

describe('beforePersist', () => {
  it('sees the state (with meta) and the pause request before it is persisted', async () => {
    const store = new WfStateStoreMemory()
    const set = vi.spyOn(store, 'set')
    const beforePersist = vi.fn((state: WfState, _pause: unknown) => {
      expect(set).not.toHaveBeenCalled()
      expect(state.meta).toMatchObject({ outlet: 'http' })
    })
    await call(makeApp(), { ...baseConfig(store), beforePersist }, { wfid: 'form' })
    expect(beforePersist).toHaveBeenCalledOnce()
    expect(beforePersist.mock.calls[0][1]).toMatchObject({ outlet: 'http' })
    expect(set).toHaveBeenCalledOnce()
  })

  it('throwing aborts: nothing persisted, nothing delivered', async () => {
    const store = new WfStateStoreMemory()
    const set = vi.spyOn(store, 'set')
    const outlet = createHttpOutlet()
    const deliver = vi.spyOn(outlet, 'deliver')
    const { error } = await call(
      makeApp(),
      {
        ...baseConfig(store),
        outlets: [outlet],
        beforePersist: () => {
          throw new Error('state too large')
        },
      },
      { wfid: 'form' },
    )
    expect(error?.message).toBe('state too large')
    expect(set).not.toHaveBeenCalled()
    expect(deliver).not.toHaveBeenCalled()
  })
})

describe('beforeResume', () => {
  /** A paused `form` flow (context `{ role: 'guest' }`) and the token to resume it. */
  async function paused(cfg: WfOutletTriggerConfig) {
    const started = await call(
      makeApp(),
      { ...cfg, initialContext: () => ({ role: 'guest' }) },
      { wfid: 'form' },
    )
    expect(typeof started.body?.wfs).toBe('string')
    return started.body.wfs as string
  }

  it('gets the state and strategy name before the token is consumed — no lists needed', async () => {
    const strategy = new HandleStateStrategy({ store: new WfStateStoreMemory() })
    const cfg: WfOutletTriggerConfig = { state: strategy, outlets: [createHttpOutlet()] }
    const token = await paused(cfg)
    const consume = vi.spyOn(strategy, 'consumeEntry')
    const beforeResume = vi.fn()
    const done = await call(
      makeApp(),
      { ...cfg, beforeResume },
      { wfs: token, input: { name: 'A' } },
    )
    expect(done.body).toEqual({ message: 'Welcome' })
    expect(beforeResume).toHaveBeenCalledOnce()
    expect(beforeResume).toHaveBeenCalledWith(
      expect.objectContaining({ schemaId: 'form', context: { role: 'guest' } }),
      { strategy: 'default' },
    )
    expect(beforeResume.mock.calls[0][0].meta).toMatchObject({ outlet: 'http' })
    expect(consume).toHaveBeenCalledOnce()
    expect(beforeResume.mock.invocationCallOrder[0]).toBeLessThan(
      consume.mock.invocationCallOrder[0],
    )
  })

  it('gets the name of the strategy that holds the state (named registry)', async () => {
    const store = new HandleStateStrategy({ store: new WfStateStoreMemory() })
    const other = new HandleStateStrategy({ store: new WfStateStoreMemory() })
    const cfg: WfOutletTriggerConfig = {
      state: { strategies: { other, store }, default: 'store' },
      outlets: [createHttpOutlet()],
    }
    const token = await paused(cfg)
    const beforeResume = vi.fn()
    await call(makeApp(), { ...cfg, beforeResume }, { wfs: token, input: { name: 'A' } })
    expect(beforeResume).toHaveBeenCalledWith(expect.anything(), { strategy: 'store' })
  })

  it('a throw propagates unchanged; nothing is consumed, persisted or delivered', async () => {
    const store = new WfStateStoreMemory()
    const outlet = createHttpOutlet()
    const cfg: WfOutletTriggerConfig = { ...baseConfig(store), outlets: [outlet] }
    const token = await paused(cfg)
    const getAndDelete = vi.spyOn(store, 'getAndDelete')
    const set = vi.spyOn(store, 'set')
    const deliver = vi.spyOn(outlet, 'deliver')
    const conflict = new HttpError(409, 'Already a member')
    const refused = await call(
      makeApp(),
      {
        ...cfg,
        beforeResume: () => {
          throw conflict
        },
      },
      { wfs: token, input: { name: 'A' } },
    )
    expect(refused.error).toBe(conflict)
    expect(refused.status).toBe(409)
    expect(getAndDelete).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    expect(deliver).not.toHaveBeenCalled()
    // the token is still usable — here or on another trigger
    const done = await call(makeApp(), cfg, { wfs: token, input: { name: 'A' } })
    expect(done.body).toEqual({ message: 'Welcome' })
  })

  it("gets the state exactly as the strategy's retrieve() returned it", async () => {
    const strategy = new HandleStateStrategy({ store: new WfStateStoreMemory() })
    const cfg: WfOutletTriggerConfig = { state: strategy, outlets: [createHttpOutlet()] }
    const token = await paused(cfg)
    const retrieve = vi.spyOn(strategy, 'retrieve')
    const beforeResume = vi.fn()
    await call(makeApp(), { ...cfg, beforeResume }, { wfs: token, input: { name: 'A' } })
    expect(retrieve).toHaveBeenCalledOnce()
    expect(beforeResume.mock.calls[0][0]).toBe(await retrieve.mock.results[0].value)
  })

  it('an async rejection is awaited: refused before the token is consumed', async () => {
    const store = new WfStateStoreMemory()
    const cfg = baseConfig(store)
    const token = await paused(cfg)
    const getAndDelete = vi.spyOn(store, 'getAndDelete')
    const refused = await call(
      makeApp(),
      {
        ...cfg,
        beforeResume: async () => {
          await Promise.resolve()
          throw new HttpError(409, 'Already a member')
        },
      },
      { wfs: token, input: { name: 'A' } },
    )
    expect(refused.status).toBe(409)
    expect(getAndDelete).not.toHaveBeenCalled()
    const done = await call(makeApp(), cfg, { wfs: token, input: { name: 'A' } })
    expect(done.body).toEqual({ message: 'Welcome' })
  })

  it('is called once per run when around retries run()', async () => {
    class Retry extends Error {}
    let runs = 0
    const cfg: WfOutletTriggerConfig = {
      ...baseConfig(),
      around: async (run) => {
        for (;;) {
          runs++
          try {
            return await run()
          } catch (error) {
            if (!(error instanceof Retry) || runs > 1) {
              throw error
            }
          }
        }
      },
    }
    const token = await paused(cfg)
    runs = 0
    const beforeResume = vi.fn().mockImplementationOnce(() => {
      throw new Retry('serialization failure')
    })
    const done = await call(
      makeApp(),
      { ...cfg, beforeResume },
      { wfs: token, input: { name: 'A' } },
    )
    expect(done.body).toEqual({ message: 'Welcome' })
    expect(runs).toBe(2)
    expect(beforeResume).toHaveBeenCalledTimes(2)
  })

  it('is not called on a start', async () => {
    const beforeResume = vi.fn()
    const cfg: WfOutletTriggerConfig = { ...baseConfig(), beforeResume }
    const token = await paused(cfg)
    expect(beforeResume).not.toHaveBeenCalled()
    await call(makeApp(), cfg, { wfs: token, input: { name: 'A' } })
    expect(beforeResume).toHaveBeenCalledOnce()
  })

  it('is not called for an unknown or spent token, which answers 410 as before', async () => {
    const beforeResume = vi.fn()
    const cfg: WfOutletTriggerConfig = { ...baseConfig(), beforeResume }
    const token = await paused(cfg)
    expect((await call(makeApp(), cfg, { wfs: token, input: { name: 'A' } })).body).toEqual({
      message: 'Welcome',
    })
    expect(beforeResume).toHaveBeenCalledOnce()
    for (const wfs of [token, 'default.nope']) {
      const gone = await call(makeApp(), cfg, { wfs, input: { name: 'A' } })
      expect(gone.status).toBe(410)
      expect(gone.body).toMatchObject({ code: 'WF_EXPIRED' })
    }
    expect(beforeResume).toHaveBeenCalledOnce()
  })

  it('runs inside around, and its throw propagates through it', async () => {
    const order: string[] = []
    const cfg: WfOutletTriggerConfig = {
      ...baseConfig(),
      around: async (run) => {
        order.push('begin')
        try {
          return await run()
        } finally {
          order.push('end')
        }
      },
    }
    const token = await paused(cfg)
    order.length = 0
    const refused = await call(
      makeApp(),
      {
        ...cfg,
        beforeResume: () => {
          order.push('beforeResume')
          throw new HttpError(409)
        },
      },
      { wfs: token, input: { name: 'A' } },
    )
    expect(refused.status).toBe(409)
    expect(order).toEqual(['begin', 'beforeResume', 'end'])
  })

  it('runs after the access lists: a list refusal never reaches it', async () => {
    const beforeResume = vi.fn()
    const cfg = baseConfig()
    const token = await paused(cfg)
    for (const lists of [{ allow: ['plain'] }, { block: ['form'] }, { startOnly: ['form'] }]) {
      const refused = await call(
        makeApp(),
        { ...cfg, ...lists, beforeResume },
        { wfs: token, input: { name: 'A' } },
      )
      expect(refused.body).toMatchObject({ code: 'WF_FORBIDDEN' })
    }
    expect(beforeResume).not.toHaveBeenCalled()
    const done = await call(
      makeApp(),
      { ...cfg, allow: ['form'], beforeResume },
      { wfs: token, input: { name: 'A' } },
    )
    expect(done.body).toEqual({ message: 'Welcome' })
    expect(beforeResume).toHaveBeenCalledOnce()
  })
})

describe('renderEnvelope', () => {
  const ru: Record<string, string> = { 'Your name': 'Ваше имя', Welcome: 'Добро пожаловать' }
  const renderEnvelope = vi.fn((envelope: unknown, info: { phase: string }) => {
    const e = envelope as Record<string, unknown>
    if (info.phase === 'paused') {
      return { ...e, title: ru[e.title as string] ?? e.title }
    }
    return { ...e, message: ru[e.message as string] ?? e.message }
  })

  it('maps the pause envelope before the token is added', async () => {
    const { body: result } = await call(
      makeApp(),
      { ...baseConfig(), renderEnvelope },
      { wfid: 'form' },
    )
    expect(result).toMatchObject({ title: 'Ваше имя', hint: 'nameHint' })
    expect(typeof result!.wfs).toBe('string')
    expect(renderEnvelope).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ wfs: expect.anything() }),
      expect.objectContaining({ phase: 'paused', outlet: 'http', schemaId: 'form' }),
    )
  })

  it('maps the finished envelope (useWfFinished data, onFinished, default)', async () => {
    const cfg = { ...baseConfig(), renderEnvelope }
    const started = await call(makeApp(), cfg, { wfid: 'form' })
    const done = await call(makeApp(), cfg, { wfs: started.body.wfs, input: { name: 'A' } })
    expect(done.body).toEqual({ message: 'Добро пожаловать' })
    expect(renderEnvelope).toHaveBeenLastCalledWith(
      { message: 'Welcome' },
      expect.objectContaining({ phase: 'finished', schemaId: 'form' }),
    )

    const viaOnFinished = await call(
      makeApp(),
      { ...cfg, onFinished: () => ({ message: 'Welcome', custom: true }) },
      { wfs: (await call(makeApp(), cfg, { wfid: 'form' })).body.wfs, input: { name: 'B' } },
    )
    expect(viaOnFinished.body).toEqual({ message: 'Добро пожаловать', custom: true })
  })

  it('may be async', async () => {
    const { body: result } = await call(
      makeApp(),
      { ...baseConfig(), renderEnvelope: async (e) => ({ ...(e as object), async: true }) },
      { wfid: 'form' },
    )
    expect(result).toMatchObject({ async: true, title: 'Your name' })
  })

  it('is not applied to redirects or errors', async () => {
    const spy = vi.fn((e: unknown) => e)
    const redirect = await call(
      makeApp(),
      { ...baseConfig(), renderEnvelope: spy },
      { wfid: 'redirect' },
    )
    expect(redirect.status).toBe(302)
    const refused = await call(
      makeApp(),
      { ...baseConfig(), allow: [], renderEnvelope: spy },
      { wfid: 'form' },
    )
    expect(refused.error).toBeDefined()
    expect(spy).not.toHaveBeenCalled()
  })
})
