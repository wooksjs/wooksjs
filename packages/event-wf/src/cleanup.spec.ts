import { current } from '@wooksjs/event-core'
import { describe, expect, it, vi } from 'vitest'
import { Wooks } from 'wooks'

import { HandleStateStrategy, WfStateStoreMemory, outletHttp } from '@prostojs/wf/outlets'

import { useWfState } from './composables'
import { createOutletHandler } from './outlets/create-handler'
import { createHttpOutlet } from './outlets/create-outlet'
import { mintWfToken } from './outlets/mint'
import { postJson } from './outlets/test-utils'
import { createWfApp } from './wf-adapter'

interface TCtx {
  n: number
}

function setup() {
  const logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  const app = createWfApp<TCtx>({ logger: logger as never }, new Wooks())
  app.step('inc', { handler: () => void useWfState().ctx<TCtx>().n++ })
  app.step('ask', {
    handler: () => {
      const { input, ctx } = useWfState()
      const value = input<number>()
      if (value === undefined) {
        return { inputRequired: 'number' }
      }
      ctx<TCtx>().n += value
    },
  })
  app.step('fail', {
    handler: () => {
      throw new Error('step failed')
    },
  })
  app.flow('done', ['inc', 'inc'])
  app.flow('pausing', ['inc', 'ask', 'inc'])
  app.flow('failing', ['inc', 'fail'])
  return { app, logger }
}

describe('run cleanup option', () => {
  it('runs when resolving the flow to resume throws', async () => {
    const { app } = setup()
    app.on('WF_FLOW', 'custom/:x', () => {
      throw new Error('flow resolution failed')
    })
    const own = vi.fn()
    await expect(
      app.resume({ schemaId: 'custom/:x', context: { n: 0 }, indexes: [0] }, { cleanup: own }),
    ).rejects.toThrow('flow resolution failed')
    expect(own).toHaveBeenCalledTimes(1)
  })
})

describe('WooksWf.attachCleanup', () => {
  it('runs once when a run finishes, inside the workflow event context', async () => {
    const { app } = setup()
    const seen: Array<{ schemaId: string; ctx: unknown }> = []
    app.attachCleanup(() => seen.push({ schemaId: useWfState().schemaId, ctx: current() }))
    const out = await app.start('done', { n: 0 })
    expect(out.finished).toBe(true)
    expect(seen).toHaveLength(1)
    expect(seen[0].schemaId).toBe('done')
    expect(seen[0].ctx).toBeDefined()
  })

  it('runs when a run pauses and again when the resumed run ends', async () => {
    const { app } = setup()
    const cleanup = vi.fn()
    app.attachCleanup(cleanup)
    const paused = await app.start('pausing', { n: 0 })
    expect(paused.inputRequired).toBeDefined()
    expect(cleanup).toHaveBeenCalledTimes(1)
    const resumed = await paused.resume!(5)
    expect(resumed.finished).toBe(true)
    expect(resumed.state.context.n).toBe(7)
    expect(cleanup).toHaveBeenCalledTimes(2)
  })

  it('runs when a step fails; the run error still reaches the caller', async () => {
    const { app } = setup()
    const cleanup = vi.fn()
    app.attachCleanup(cleanup)
    await expect(app.start('failing', { n: 0 })).rejects.toThrow('step failed')
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('runs for an unknown flow', async () => {
    const { app } = setup()
    const cleanup = vi.fn()
    app.attachCleanup(cleanup)
    await expect(app.start('missing', { n: 0 })).rejects.toThrow('Unknown schemaId: missing')
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('runs, together with the run cleanup option, when resolving the flow to resume throws', async () => {
    const { app } = setup()
    app.on('WF_FLOW', 'custom/:x', () => {
      throw new Error('flow resolution failed')
    })
    const attached = vi.fn()
    const own = vi.fn()
    app.attachCleanup(attached)
    await expect(
      app.resume({ schemaId: 'custom/:x', context: { n: 0 }, indexes: [0] }, { cleanup: own }),
    ).rejects.toThrow('flow resolution failed')
    expect(own).toHaveBeenCalledTimes(1)
    expect(attached).toHaveBeenCalledTimes(1)
  })

  it('runs after the run cleanup option, even when that one throws', async () => {
    const { app } = setup()
    const order: string[] = []
    app.attachCleanup(() => order.push('attached'))
    await app.start('done', { n: 0 }, { cleanup: () => order.push('own') })
    expect(order).toEqual(['own', 'attached'])
    await expect(
      app.start(
        'done',
        { n: 0 },
        {
          cleanup: () => {
            throw new Error('own cleanup failed')
          },
        },
      ),
    ).rejects.toThrow('own cleanup failed')
    expect(order).toEqual(['own', 'attached', 'attached'])
  })

  it('applies to start/resume captured before it was attached (outlet handlers bind them)', async () => {
    const { app } = setup()
    const start = app.start.bind(app)
    const resume = app.resume.bind(app)
    const cleanup = vi.fn()
    app.attachCleanup(cleanup)
    const paused = await start('pausing', { n: 0 })
    await resume(paused.state, { input: 1 })
    expect(cleanup).toHaveBeenCalledTimes(2)
  })

  it('logs a throwing or rejecting cleanup without failing the run or skipping the others', async () => {
    const { app, logger } = setup()
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const after = vi.fn()
      app.attachCleanup(() => {
        throw new Error('sync cleanup failed')
      })
      app.attachCleanup(() => Promise.reject(new Error('async cleanup failed')))
      app.attachCleanup(after)
      const out = await app.start('done', { n: 0 })
      expect(out.finished).toBe(true)
      expect(after).toHaveBeenCalledTimes(1)
      await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(2))
      const messages = logger.error.mock.calls.map((c) => (c[1] as Error).message).toSorted()
      expect(messages).toEqual(['async cleanup failed', 'sync cleanup failed'])
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('detaches, and attaching the same function twice runs it once', async () => {
    const { app } = setup()
    const cleanup = vi.fn()
    const detach = app.attachCleanup(cleanup)
    app.attachCleanup(cleanup)
    await app.start('done', { n: 0 })
    expect(cleanup).toHaveBeenCalledTimes(1)
    detach()
    await app.start('done', { n: 0 })
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('takes attaches and detaches made while a run ends into account from the next run', async () => {
    const { app } = setup()
    const late = vi.fn()
    let attached = false
    app.attachCleanup(() => {
      if (!attached) {
        attached = true
        app.attachCleanup(late)
      }
    })
    await app.start('done', { n: 0 })
    expect(late).not.toHaveBeenCalled()
    await app.start('done', { n: 0 })
    expect(late).toHaveBeenCalledTimes(1)
  })

  it('skips a cleanup detached by a step of the run', async () => {
    const { app } = setup()
    const cleanup = vi.fn()
    const detach = app.attachCleanup(cleanup)
    app.step('detach', { handler: () => void detach() })
    app.flow('detaching', ['inc', 'detach'])
    await app.start('detaching', { n: 0 })
    expect(cleanup).not.toHaveBeenCalled()
  })

  it('runs for runs started and resumed by the outlet trigger and by mintWfToken', async () => {
    const { app } = setup()
    app.step('form', {
      handler: () => {
        const value = useWfState().input<{ v: number }>()
        if (!value) {
          return outletHttp({ fields: ['v'] })
        }
        useWfState().ctx<TCtx>().n += value.v
      },
    })
    app.flow('form', ['inc', 'form'])
    // built before attachCleanup, like an app wiring its outlet endpoint first
    const handle = createOutletHandler(app)
    const cleanup = vi.fn()
    app.attachCleanup(cleanup)
    const strategy = new HandleStateStrategy({ store: new WfStateStoreMemory() })
    const cfg = { state: strategy, outlets: [createHttpOutlet()] }

    const started = await postJson(() => handle(cfg), { wfid: 'form' })
    expect(started.body).toMatchObject({ fields: ['v'] })
    expect(cleanup).toHaveBeenCalledTimes(1)
    const finished = await postJson(() => handle(cfg), { wfs: started.body.wfs, input: { v: 2 } })
    expect(finished.body).toEqual({ finished: true })
    expect(cleanup).toHaveBeenCalledTimes(2)

    const minted = await mintWfToken(app, { wfid: 'form', context: { n: 0 }, state: strategy })
    expect(minted.token).toBeDefined()
    expect(cleanup).toHaveBeenCalledTimes(3)
  })
})
