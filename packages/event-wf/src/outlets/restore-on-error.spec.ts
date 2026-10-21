import { randomBytes } from 'node:crypto'

import { HttpError } from '@wooksjs/event-http'
import {
  EncapsulatedStateStrategy,
  HandleStateStrategy,
  WfStateStoreMemory,
  outletHttp,
} from '@prostojs/wf/outlets'
import type { WfStateStrategy } from '@prostojs/wf/outlets'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGlobalWooks } from 'wooks'

import { useWfState } from '../composables'
import { createWfApp } from '../wf-adapter'

import { createOutletHandler } from './create-handler'
import { createHttpOutlet } from './create-outlet'
import { postJson, quietLogger, rawHandle } from './test-utils'
import type { WfOutletTriggerConfig } from './types'

beforeEach(() => clearGlobalWooks())

interface Ctx {
  attempts?: number
  log?: string[]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * `flaky`: pauses (with an optional step TTL), then on resume mutates the
 * context and — while `failures.left` > 0 — waits `failures.delay` ms and
 * throws; the next resume succeeds.
 */
function setup(failures: { left: number; error: () => Error; ttl?: number; delay?: number }) {
  const app = createWfApp<Ctx>({ logger: quietLogger })
  app.step('ask', {
    handler: async () => {
      const { ctx, input } = useWfState()
      if (!input()) {
        const pause = outletHttp({ fields: ['x'] })
        return failures.ttl ? { ...pause, expires: Date.now() + failures.ttl } : pause
      }
      const c = ctx<Ctx>()
      c.attempts = (c.attempts ?? 0) + 1
      ;(c.log ??= []).push('mutated-before-throw')
      if (failures.left > 0) {
        failures.left--
        if (failures.delay) {
          await sleep(failures.delay)
        }
        throw failures.error()
      }
    },
  })
  app.flow('flaky', ['ask'])
  return createOutletHandler(app)
}

type Handle = ReturnType<typeof createOutletHandler>

const post = (handle: Handle, config: WfOutletTriggerConfig, body: unknown) =>
  postJson(() => handle(config), body)

/**
 * A memory-backed HandleStateStrategy. A finite default TTL keeps the entry's
 * expiry known (restoreOnError never restores an unknown expiry).
 */
const handleStrategy = (store = new WfStateStoreMemory(), defaultTtl = 60_000) =>
  new HandleStateStrategy({ store, defaultTtl })

describe('outlet trigger — restoreOnError', () => {
  it('off (default): a throwing step burns a HandleStateStrategy token', async () => {
    const handle = setup({ left: 1, error: () => new Error('boom') })
    const config = { state: handleStrategy(), outlets: [createHttpOutlet()] }
    const { body } = await post(handle, config, { wfid: 'flaky' })
    const failed = await post(handle, config, { wfs: body.wfs, input: { x: 1 } })
    expect(failed.error?.message).toBe('boom')
    const retry = await post(handle, config, { wfs: body.wfs, input: { x: 1 } })
    expect(retry.status).toBe(410)
  })

  it('off: the persisted state is exactly { schemaId, context, indexes, meta: { outlet } }', async () => {
    const handle = setup({ left: 0, error: () => new Error('unused'), ttl: 60_000 })
    const strategy = handleStrategy(new WfStateStoreMemory(), 1000)
    const config = { state: strategy, outlets: [createHttpOutlet()] }
    const { body } = await post(handle, config, { wfid: 'flaky' })
    expect(JSON.stringify(await strategy.retrieve(rawHandle(body.wfs)))).toBe(
      JSON.stringify({ schemaId: 'flaky', context: {}, indexes: [0], meta: { outlet: 'http' } }),
    )
  })

  it.each([
    ['a plain Error', () => new Error('boom')],
    ['an HttpError', () => new HttpError(422, 'bad input')],
  ])(
    'on: after %s the same token can be retried, from the pre-step state',
    async (_label, error) => {
      const handle = setup({ left: 1, error })
      const strategy = handleStrategy()
      const config = { state: strategy, outlets: [createHttpOutlet()], restoreOnError: true }
      const { body } = await post(handle, config, { wfid: 'flaky' })

      const failed = await post(handle, config, { wfs: body.wfs, input: { x: 1 } })
      // The original error still propagates unchanged.
      expect(failed.error).toBeInstanceOf(error().constructor)

      // Restored under the same handle, with the context as it was before the step.
      const restored = await strategy.retrieve(rawHandle(body.wfs))
      expect(restored?.context).toEqual({})
      expect(restored?.meta).toEqual({ outlet: 'http', restores: 1 })

      const retry = await post(handle, config, { wfs: body.wfs, input: { x: 1 } })
      expect(retry.body).toEqual({ finished: true })
    },
  )

  it.each([
    ['a step TTL', { ttl: 60_000 }, undefined],
    ['the strategy defaultTtl', {}, 60_000],
    ['a never-expiring HandleStateStrategy entry', {}, 0],
  ] as const)(
    'keeps the exact original expiry (%s), also for tokens minted with the option off',
    async (_label, step, defaultTtl) => {
      const handle = setup({ left: 1, error: () => new Error('boom'), ...step })
      const store = new WfStateStoreMemory()
      const strategy = handleStrategy(store, defaultTtl)
      const off = { state: strategy, outlets: [createHttpOutlet()] }
      const { body } = await post(handle, off, { wfid: 'flaky' })
      const raw = rawHandle(body.wfs)
      const original = (await store.get(raw))?.expiresAt
      await sleep(5)

      await post(handle, { ...off, restoreOnError: true }, { wfs: body.wfs, input: { x: 1 } })
      expect((await strategy.retrieve(raw))?.meta).toEqual({ outlet: 'http', restores: 1 })
      expect((await store.get(raw))?.expiresAt).toBe(original)
    },
  )

  /** A HandleStateStrategy whose consumeEntry() reports `expiresAt` as `report` decides. */
  function reporting(report: (expiresAt: number | undefined) => number | undefined) {
    const strategy = handleStrategy()
    const consumeEntry = strategy.consumeEntry.bind(strategy)
    strategy.consumeEntry = async (token) => {
      const entry = await consumeEntry(token)
      return entry && { state: entry.state, expiresAt: report(entry.expiresAt) }
    }
    return strategy
  }

  it('an entry reported as never expiring (expiresAt: 0) is restored without an expiry', async () => {
    const handle = setup({ left: 1, error: () => new Error('boom') })
    const strategy = reporting(() => 0)
    const persist = vi.spyOn(strategy, 'persistEntry')
    const config = { state: strategy, outlets: [createHttpOutlet()], restoreOnError: true }
    const { body } = await post(handle, config, { wfid: 'flaky' })
    persist.mockClear()
    await post(handle, config, { wfs: body.wfs, input: { x: 1 } })
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist.mock.calls[0][1]).toEqual({ expiresAt: 0 })
    expect((await post(handle, config, { wfs: body.wfs, input: { x: 1 } })).body).toEqual({
      finished: true,
    })
  })

  it('an entry with an unknown expiry (expiresAt omitted) is not restored', async () => {
    const handle = setup({ left: 1, error: () => new Error('boom'), ttl: 60_000 })
    const strategy = reporting(() => undefined)
    const config = { state: strategy, outlets: [createHttpOutlet()], restoreOnError: true }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { body } = await post(handle, config, { wfid: 'flaky' })
      await post(handle, config, { wfs: body.wfs, input: { x: 1 } })
      expect(await strategy.retrieve(rawHandle(body.wfs))).toBeNull()
    } finally {
      warn.mockRestore()
    }
  })

  it('an entry that expired while the step ran is not restored', async () => {
    const handle = setup({ left: 1, error: () => new Error('boom'), ttl: 40, delay: 60 })
    const strategy = handleStrategy()
    const config = { state: strategy, outlets: [createHttpOutlet()], restoreOnError: true }
    const { body } = await post(handle, config, { wfid: 'flaky' })
    const failed = await post(handle, config, { wfs: body.wfs, input: { x: 1 } })
    expect(failed.error?.message).toBe('boom')
    expect(await strategy.retrieve(rawHandle(body.wfs))).toBeNull()
  })

  it('a strategy without consumeEntry()/persistEntry() is not restored (unknown expiry); warns once', async () => {
    const handle = setup({ left: 2, error: () => new Error('boom') })
    const base = handleStrategy()
    const custom: WfStateStrategy = {
      persist: (...args) => base.persist(...args),
      retrieve: (token) => base.retrieve(token),
      consume: (token) => base.consume(token),
    }
    const config = { state: custom, outlets: [createHttpOutlet()], restoreOnError: true }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const first = await post(handle, config, { wfid: 'flaky' })
      await post(handle, config, { wfs: first.body.wfs, input: { x: 1 } })
      expect((await post(handle, config, { wfs: first.body.wfs, input: { x: 1 } })).status).toBe(
        410,
      )
      const second = await post(handle, config, { wfid: 'flaky' })
      await post(handle, config, { wfs: second.body.wfs, input: { x: 1 } })
      const hits = warn.mock.calls.filter((c) => String(c[0]).includes('consumeEntry'))
      expect(hits.length).toBeLessThanOrEqual(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('EncapsulatedStateStrategy: the token never stopped working; nothing is re-persisted', async () => {
    const handle = setup({ left: 1, error: () => new Error('boom') })
    const strategy = new EncapsulatedStateStrategy({ secret: randomBytes(32) })
    const persist = vi.spyOn(strategy, 'persistEntry')
    const config = { state: strategy, outlets: [createHttpOutlet()], restoreOnError: true }
    const { body } = await post(handle, config, { wfid: 'flaky' })
    persist.mockClear()
    const failed = await post(handle, config, { wfs: body.wfs, input: { x: 1 } })
    expect(failed.error?.message).toBe('boom')
    expect(persist).not.toHaveBeenCalled()
    const retry = await post(handle, config, { wfs: body.wfs, input: { x: 1 } })
    expect(retry.body).toEqual({ finished: true })
  })

  it('a failing restore is logged, never masks the step error', async () => {
    const handle = setup({ left: 1, error: () => new Error('boom') })
    const strategy = handleStrategy()
    const config = { state: strategy, outlets: [createHttpOutlet()], restoreOnError: true }
    const { body } = await post(handle, config, { wfid: 'flaky' })
    vi.spyOn(strategy, 'persistEntry').mockRejectedValue(new Error('store down'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const failed = await post(handle, config, { wfs: body.wfs, input: { x: 1 } })
      expect(failed.error?.message).toBe('boom')
      expect(errorLog.mock.calls.some((c) => String(c[0]).includes('store down'))).toBe(true)
    } finally {
      errorLog.mockRestore()
    }
  })

  describe('bounds (in-context counters are rolled back)', () => {
    /** Login flow that counts attempts IN the workflow context and locks out after 3. */
    function loginApp() {
      const app = createWfApp<{ attempts?: number; locked?: boolean }>({ logger: quietLogger })
      app.step('pw', {
        handler: () => {
          const s = useWfState()
          const c = s.ctx<{ attempts?: number; locked?: boolean }>()
          const input = s.input<{ pw: string }>()
          if (!input) {
            return outletHttp({ fields: ['pw'] })
          }
          c.attempts = (c.attempts ?? 0) + 1
          if (c.attempts > 3) {
            c.locked = true
            return outletHttp({ fields: ['locked'] })
          }
          if (input.pw !== 'secret') {
            throw new Error('bad password')
          }
        },
      })
      app.flow('login', ['pw'])
      return createOutletHandler(app)
    }

    async function guesses(config: WfOutletTriggerConfig, n: number) {
      const handle = loginApp()
      const { body } = await post(handle, config, { wfid: 'login' })
      const outcomes: string[] = []
      for (let i = 0; i < n; i++) {
        const r = await post(handle, config, { wfs: body.wfs, input: { pw: `guess${i}` } })
        outcomes.push(r.error ? 'error' : String(r.status))
      }
      return outcomes
    }

    it('the in-context counter is rolled back, so maxRestores is what stops guessing', async () => {
      const config = {
        state: handleStrategy(),
        outlets: [createHttpOutlet()],
        restoreOnError: true,
      }
      // 1 consumed attempt + 3 restores = 4 guesses, then the handle stays burned (410).
      expect(await guesses(config, 8)).toEqual([
        'error',
        'error',
        'error',
        'error',
        '410',
        '410',
        '410',
        '410',
      ])
    })

    it('maxRestores sets the cap (0 disables restoring)', async () => {
      const base = { state: handleStrategy(), outlets: [createHttpOutlet()], restoreOnError: true }
      expect(await guesses({ ...base, maxRestores: 1 }, 4)).toEqual([
        'error',
        'error',
        '410',
        '410',
      ])
      expect(await guesses({ ...base, state: handleStrategy(), maxRestores: 0 }, 2)).toEqual([
        'error',
        '410',
      ])
    })

    it('predicate form: only errors it accepts are restored', async () => {
      class InfraError extends Error {}
      const handle = setup({ left: 2, error: () => new InfraError('db down') })
      const config = {
        state: handleStrategy(),
        outlets: [createHttpOutlet()],
        restoreOnError: (error: unknown) => error instanceof InfraError,
      }
      const { body } = await post(handle, config, { wfid: 'flaky' })
      await post(handle, config, { wfs: body.wfs, input: { x: 1 } })
      await post(handle, config, { wfs: body.wfs, input: { x: 1 } })
      expect((await post(handle, config, { wfs: body.wfs, input: { x: 1 } })).body).toEqual({
        finished: true,
      })

      // a "wrong password" error is not accepted → the token is burned
      const login = loginApp()
      const strict = { ...config, state: handleStrategy() }
      const started = await post(login, strict, { wfid: 'login' })
      await post(login, strict, { wfs: started.body.wfs, input: { pw: 'nope' } })
      expect(
        (await post(login, strict, { wfs: started.body.wfs, input: { pw: 'secret' } })).status,
      ).toBe(410)
    })

    it('restores never extend the lifetime set by the strategy defaultTtl', async () => {
      const handle = setup({ left: 100, error: () => new Error('boom') })
      const strategy = handleStrategy(new WfStateStoreMemory(), 300)
      const config = {
        state: strategy,
        outlets: [createHttpOutlet()],
        restoreOnError: true,
        maxRestores: 100,
      }
      const { body } = await post(handle, config, { wfid: 'flaky' })
      for (let i = 0; i < 4; i++) {
        await sleep(100)
        await post(handle, config, { wfs: body.wfs, input: { x: 1 } })
      }
      // ~400ms later: gone, although it failed (and was restored) repeatedly.
      expect(await strategy.retrieve(rawHandle(body.wfs))).toBeNull()
    })
  })
})
