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
