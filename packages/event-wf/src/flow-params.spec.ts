import { randomBytes } from 'node:crypto'

import { useRouteParams } from '@wooksjs/event-core'
import {
  EncapsulatedStateStrategy,
  HandleStateStrategy,
  WfStateStoreMemory,
  outletHttp,
} from '@prostojs/wf/outlets'
import type { WfStateStrategy } from '@prostojs/wf/outlets'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearGlobalWooks, Wooks } from 'wooks'

import { useWfState } from './composables'
import { createHttpOutlet, createOutletHandler } from './outlets'
import { postJson, quietLogger } from './outlets/test-utils'
import { createWfApp } from './wf-adapter'

beforeEach(() => clearGlobalWooks())

interface Seen {
  init?: Record<string, unknown>
  steps: Array<{ step: string; route: Record<string, unknown>; flow: Record<string, unknown> }>
}

/** Flow `user/:id` with a parametric step `greet/:who` and a pausing step. */
function createApp(seen: Seen) {
  const app = createWfApp<{ done?: boolean }>()
  const record = (step: string) =>
    seen.steps.push({
      step,
      route: { ...useRouteParams().params },
      flow: { ...useWfState().flowParams() },
    })
  app.step('greet/:who', {
    handler: () => {
      record('greet')
    },
  })
  app.step('ask', {
    handler: () => {
      record('ask')
      return useWfState().input() ? undefined : outletHttp({ fields: ['x'] })
    },
  })
  app.step('after', {
    handler: () => {
      record('after')
    },
  })
  app.flow('user/:id', ['greet/world', 'ask', 'after'], undefined, () => {
    seen.init = { ...useRouteParams().params }
  })
  return app
}

describe('flow route params (useWfState().flowParams)', () => {
  it('start: init and steps see the flow params via flowParams(); step useRouteParams() is unchanged', async () => {
    const seen: Seen = { steps: [] }
    const app = createApp(seen)
    const out = await app.start('user/42', {})
    expect(seen.init).toEqual({ id: '42' })
    expect(seen.steps).toEqual([
      { step: 'greet', route: { who: 'world' }, flow: { id: '42' } },
      { step: 'ask', route: {}, flow: { id: '42' } },
    ])
    expect(out.state.schemaId).toBe('user/:id')
    expect((out.state as { flowParams?: unknown }).flowParams).toEqual({ id: '42' })
  })

  it('a step param with the same name as a flow param does not clash', async () => {
    const seen: Seen = { steps: [] }
    const app = createWfApp()
    app.step('show/:id', {
      handler: () => {
        seen.steps.push({
          step: 'show',
          route: { ...useRouteParams().params },
          flow: { ...useWfState().flowParams() },
        })
      },
    })
    app.flow('user/:id', ['show/step-value'])
    await app.start('user/42', {})
    expect(seen.steps[0]).toEqual({
      step: 'show',
      route: { id: 'step-value' },
      flow: { id: '42' },
    })
  })

  it('resume restores the flow params from the state (not the stored pattern)', async () => {
    const seen: Seen = { steps: [] }
    const app = createApp(seen)
    const out = await app.start('user/42', {})
    seen.steps = []
    seen.init = undefined
    // Round-trip through JSON, as a persisted state would.
    const state = JSON.parse(JSON.stringify(out.state))
    await app.resume(state, { input: { x: 1 } })
    expect(seen.init).toEqual({ id: '42' })
    expect(seen.steps).toEqual([
      { step: 'ask', route: {}, flow: { id: '42' } },
      { step: 'after', route: {}, flow: { id: '42' } },
    ])
  })

  it('a non-parametric flow stores no flowParams and sees empty ones', async () => {
    const app = createWfApp()
    let flow: Record<string, unknown> | undefined
    app.step('ask', {
      handler: () => {
        flow = useWfState().flowParams()
        return useWfState().input() ? undefined : outletHttp({ fields: ['x'] })
      },
    })
    app.flow('plain', ['ask'])
    const out = await app.start('plain', {})
    expect(flow).toEqual({})
    expect('flowParams' in out.state).toBe(false)
  })

  const strategies: Array<[string, () => WfStateStrategy]> = [
    ['HandleStateStrategy', () => new HandleStateStrategy({ store: new WfStateStoreMemory() })],
    ['EncapsulatedStateStrategy', () => new EncapsulatedStateStrategy({ secret: randomBytes(32) })],
  ]

  it.each(strategies)(
    'start → pause → resume through the outlet trigger keeps flow params (%s)',
    async (_name, makeStrategy) => {
      const seen: Seen = { steps: [] }
      const app = createApp(seen)
      const handle = createOutletHandler(app)
      const config = { state: makeStrategy(), outlets: [createHttpOutlet()] }
      const post = async (body: unknown) => (await postJson(() => handle(config), body)).body

      const started = await post({ wfid: 'user/42' })
      expect(typeof started.wfs).toBe('string')
      seen.steps = []
      const resumed = await post({ wfs: started.wfs, input: { x: 1 } })
      expect(resumed).toEqual({ finished: true })
      expect(seen.init).toEqual({ id: '42' })
      expect(seen.steps.map((s) => s.flow)).toEqual([{ id: '42' }, { id: '42' }])
    },
  )
})

describe('resume dispatch is by registered id only', () => {
  it('a flow id registered by two adapters on one router: start and resume run the first', async () => {
    const wooks = new Wooks({ logger: quietLogger })
    const v1 = createWfApp({ logger: quietLogger }, wooks)
    const v2 = createWfApp({ logger: quietLogger }, wooks)
    const seen: string[] = []
    for (const app of [v1, v2]) {
      app.step('s', {
        handler: () => (useWfState().input() ? undefined : outletHttp({ fields: ['x'] })),
      })
    }
    v1.flow('x', ['s'], undefined, () => void seen.push('init-v1'))
    v2.flow('x', ['s'], undefined, () => void seen.push('init-v2'))
    const out = await v2.start('x', {})
    await v2.resume(out.state, { input: { x: 1 } })
    expect(seen).toEqual(['init-v1', 'init-v1'])
  })

  it('never resumes via onNotFound or a routed look-alike', async () => {
    const ran: string[] = []
    const app = createWfApp({ onNotFound: () => ({ id: 'admin' }), router: { ignoreCase: true } })
    app.step('s', {
      handler: () => {
        ran.push(useWfState().schemaId)
        return useWfState().input() ? undefined : outletHttp({ fields: ['x'] })
      },
    })
    app.flow('admin', ['s'])
    for (const schemaId of ['old-flow', 'ADMIN', 'admin/']) {
      await expect(
        app.resume({ schemaId, indexes: [0], context: {} }, { input: 1 }),
      ).rejects.toThrow(/Unknown schemaId/)
    }
    expect(ran).toEqual([])
    await app.resume({ schemaId: 'admin', indexes: [0], context: {} }, { input: 1 })
    expect(ran).toEqual(['admin'])
  })

  it('falls back to the registered id equal up to leading slashes (never to routing)', async () => {
    const app = createWfApp()
    const ran: string[] = []
    app.step('s', { handler: () => void ran.push(useWfState().schemaId) })
    app.flow('/x', ['s'])
    app.flow('y', ['s'])
    await app.resume({ schemaId: 'x', indexes: [0], context: {} })
    await app.resume({ schemaId: '//y', indexes: [0], context: {} })
    expect(ran).toEqual(['x', '//y'])
    await expect(app.resume({ schemaId: 'x/', indexes: [0], context: {} })).rejects.toThrow(
      /Unknown schemaId/,
    )
  })
})
