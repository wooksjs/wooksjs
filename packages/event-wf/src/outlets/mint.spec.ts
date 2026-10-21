import {
  HandleStateStrategy,
  WfStateStoreMemory,
  outletEmail,
  outletHttp,
} from '@prostojs/wf/outlets'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGlobalWooks } from 'wooks'

import { useWfState } from '../composables'
import { createWfApp } from '../wf-adapter'
import type { WooksWf } from '../wf-adapter'

import { createOutletHandler } from './create-handler'
import { createEmailOutlet, createHttpOutlet } from './create-outlet'
import { mintWfToken } from './mint'
import { postJson, quietLogger, rawHandle } from './test-utils'
import type { WfOutletTriggerConfig } from './types'
import { swapStrategy } from './use-wf-strategy'

/*
 * S8 contract: `mintWfToken(wf, { wfid, context, state, ... })` starts a flow with no request
 * and persists its first pause exactly as the trigger would — same strategy registry (`state`),
 * `<strategy>.<handle>` token, `meta.outlet`, expiry tracking — so the token resumes through
 * a trigger configured with the same `state`, including `restoreOnError`.
 */

beforeEach(() => clearGlobalWooks())

let attempts = 0

function makeApp() {
  const app = createWfApp<{ email?: string; name?: string }>({ logger: quietLogger })
  app.step('invite', {
    handler: () => {
      if (useWfState().input()) {
        return
      }
      return outletEmail(useWfState().ctx<{ email: string }>().email, 'invite')
    },
  })
  app.step('accept', {
    handler: () => {
      const { input, ctx } = useWfState()
      const i = input<{ name: string }>()
      if (!i) {
        return outletHttp({ fields: ['name'] })
      }
      ctx<{ name?: string }>().name = i.name
    },
  })
  app.step('flaky', {
    handler: () => {
      const i = useWfState().input<{ go: boolean }>()
      if (!i) {
        return outletHttp({ fields: ['go'] })
      }
      attempts++
      if (attempts === 1) {
        throw new Error('db hiccup')
      }
    },
  })
  app.step('escalate', {
    handler: () => {
      if (useWfState().input()) {
        return
      }
      swapStrategy('secure')
      return outletHttp({ fields: ['otp'] })
    },
  })
  app.step('instant', { handler: () => undefined })
  app.flow('onboard', ['invite', 'accept'])
  app.flow('flaky', ['flaky'])
  app.flow('escalated', ['escalate'])
  app.flow('instant', ['instant'])
  return app
}

const resume = (app: WooksWf, cfg: WfOutletTriggerConfig, body: unknown) =>
  postJson(() => createOutletHandler(app)(cfg), body)

describe('mintWfToken', () => {
  it('round trip: mint (no request) → resume through the trigger → finish', async () => {
    const app = makeApp()
    const strategy = new HandleStateStrategy({ store: new WfStateStoreMemory() })
    const minted = await mintWfToken(app, {
      wfid: 'onboard',
      context: { email: 'new@example.com' },
      state: strategy,
    })
    expect(minted.token).toMatch(/^default\.[\w-]+$/u)
    expect(minted.inputRequired).toMatchObject({ outlet: 'email', target: 'new@example.com' })
    expect(minted.expiresAt).toBeDefined()

    const cfg: WfOutletTriggerConfig = {
      state: strategy,
      outlets: [createHttpOutlet(), createEmailOutlet(async () => {})],
      allow: ['onboard'],
    }
    const step1 = await resume(app, cfg, { wfs: minted.token, input: { clicked: true } })
    expect(step1.body).toMatchObject({ fields: ['name'] })
    const step2 = await resume(app, cfg, { wfs: step1.body.wfs, input: { name: 'Ann' } })
    expect(step2.body).toEqual({ finished: true })
  })

  it('persists the trigger meta (outlet) plus extra meta, and honours ttl', async () => {
    const store = new WfStateStoreMemory()
    const set = vi.spyOn(store, 'set')
    const app = makeApp()
    const minted = await mintWfToken(app, {
      wfid: 'onboard',
      context: { email: 'a@b.c' },
      state: new HandleStateStrategy({ store }),
      meta: { issuedBy: 'admin', outlet: 'spoofed' },
      ttl: 60_000,
    })
    const [, state, expiresAt] = set.mock.calls[0]
    expect(state.meta).toMatchObject({ issuedBy: 'admin', outlet: 'email' })
    expect(expiresAt).toBe(minted.expiresAt)
    expect(Math.abs((expiresAt as number) - Date.now() - 60_000)).toBeLessThan(2000)
  })

  it('caller meta can never set trigger-owned keys (outlet, restores, __wf*)', async () => {
    const strategy = new HandleStateStrategy({ store: new WfStateStoreMemory() })
    const minted = await mintWfToken(makeApp(), {
      wfid: 'onboard',
      context: { email: 'a@b.c' },
      state: strategy,
      meta: {
        restores: -1000,
        outlet: 'evil',
        __wfExpiry: { at: 0 },
        __wfAnything: 1,
        issuedBy: 'admin',
      },
    })
    const stored = await strategy.retrieve(minted.token!.slice(minted.token!.indexOf('.') + 1))
    expect(stored?.meta).toEqual({ issuedBy: 'admin', outlet: 'email' })
  })

  it('caller meta is kept at the next pause the trigger persists', async () => {
    const app = makeApp()
    const store = new WfStateStoreMemory()
    const strategy = new HandleStateStrategy({ store })
    const minted = await mintWfToken(app, {
      wfid: 'onboard',
      context: { email: 'a@b.c' },
      state: strategy,
      meta: { issuedBy: 'admin' },
    })
    const step1 = await resume(
      app,
      { state: strategy, outlets: [createHttpOutlet()] },
      { wfs: minted.token, input: {} },
    )
    const stored = await strategy.retrieve(rawHandle(step1.body.wfs))
    expect(stored?.meta).toEqual({ issuedBy: 'admin', outlet: 'http' })
  })

  it('an expired minted token is refused with 410 WF_EXPIRED', async () => {
    const app = makeApp()
    const strategy = new HandleStateStrategy({ store: new WfStateStoreMemory() })
    const minted = await mintWfToken(app, {
      wfid: 'onboard',
      context: { email: 'a@b.c' },
      state: strategy,
      ttl: 1,
    })
    await new Promise((r) => setTimeout(r, 10))
    const { error } = await resume(
      app,
      { state: strategy, outlets: [createHttpOutlet()] },
      { wfs: minted.token },
    )
    expect(error?.body).toMatchObject({ statusCode: 410, code: 'WF_EXPIRED' })
  })

  it('restoreOnError works on a minted token (expiry tracked, retry succeeds)', async () => {
    attempts = 0
    const app = makeApp()
    const strategy = new HandleStateStrategy({ store: new WfStateStoreMemory() })
    const minted = await mintWfToken(app, { wfid: 'flaky', context: {}, state: strategy })
    const cfg: WfOutletTriggerConfig = {
      state: strategy,
      outlets: [createHttpOutlet()],
      restoreOnError: true,
    }
    const first = await resume(app, cfg, { wfs: minted.token, input: { go: true } })
    expect(first.error?.message).toBe('db hiccup')
    const retry = await resume(app, cfg, { wfs: minted.token, input: { go: true } })
    expect(retry.body).toEqual({ finished: true })
  })

  it('uses the strategy a step swapped to, and prefixes the token with its name', async () => {
    const app = makeApp()
    const state = {
      strategies: {
        default: new HandleStateStrategy({ store: new WfStateStoreMemory() }),
        secure: new HandleStateStrategy({ store: new WfStateStoreMemory() }),
      },
      default: 'default',
    }
    const minted = await mintWfToken(app, { wfid: 'escalated', context: {}, state })
    expect(minted.token).toMatch(/^secure\./u)
    const done = await resume(
      app,
      { state, outlets: [createHttpOutlet()] },
      { wfs: minted.token, input: { otp: 1 } },
    )
    expect(done.body).toEqual({ finished: true })
  })

  it('a default-strategy picker gets (wfid, flowId)', async () => {
    const app = makeApp()
    const pick = vi.fn(() => 'b')
    const state = {
      strategies: {
        a: new HandleStateStrategy({ store: new WfStateStoreMemory() }),
        b: new HandleStateStrategy({ store: new WfStateStoreMemory() }),
      },
      default: pick,
    }
    const minted = await mintWfToken(app, { wfid: '/onboard', context: { email: 'x@y.z' }, state })
    expect(pick).toHaveBeenCalledWith('/onboard', 'onboard')
    expect(minted.token).toMatch(/^b\./u)
  })

  it('a flow that finishes without pausing yields no token', async () => {
    const minted = await mintWfToken(makeApp(), {
      wfid: 'instant',
      state: new HandleStateStrategy({ store: new WfStateStoreMemory() }),
    })
    expect(minted.token).toBeUndefined()
    expect(minted.output.finished).toBe(true)
  })

  it('an unknown default strategy name throws before anything runs', async () => {
    const start = vi.fn()
    await expect(
      mintWfToken({ start } as never, {
        wfid: 'onboard',
        state: {
          strategies: { a: new HandleStateStrategy({ store: new WfStateStoreMemory() }) },
          default: 'zzz',
        },
      }),
    ).rejects.toThrow(/zzz/u)
    expect(start).not.toHaveBeenCalled()
  })
})
