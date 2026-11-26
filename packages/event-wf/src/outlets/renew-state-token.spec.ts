import { randomBytes } from 'node:crypto'

import {
  EncapsulatedStateStrategy,
  HandleStateStrategy,
  WfStateStoreMemory,
  outletHttp,
} from '@prostojs/wf/outlets'
import type { WfStateStrategy } from '@prostojs/wf/outlets'
import { current } from '@wooksjs/event-core'
import { prepareTestHttpContext, useResponse } from '@wooksjs/event-http'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearGlobalWooks } from 'wooks'

import { useWfState } from '../composables'
import type { WfPauseRequest } from '../pause-request'
import { createWfApp } from '../wf-adapter'

import { createOutletHandler } from './create-handler'
import { createHttpOutlet } from './create-outlet'
import { quietLogger, rawHandle } from './test-utils'
import type { WfOutletTriggerConfig } from './types'
import { renewStateToken, swapStrategy, useWfStrategy } from './use-wf-strategy'

beforeEach(() => clearGlobalWooks())

interface Input {
  password?: string
  renew?: boolean
  fail?: boolean
  /** `swapStrategy()` to this name */
  swap?: string
  /** wait this many ms first */
  wait?: number
}

/**
 * Flow `invite`: `password` pauses; on input it waits `input.wait` ms, calls `renewStateToken()`
 * when `input.renew`, `swapStrategy(input.swap)` when set, and then throws when `input.fail`;
 * `profile` and `confirm` pause once each. Flow `short`: `password` alone — finishes on input.
 */
function makeHandle() {
  const app = createWfApp<Record<string, unknown>>({ logger: quietLogger })
  app.step('password', {
    handler: async () => {
      const input = useWfState().input<Input>()
      if (!input) {
        return outletHttp({ step: 'password' })
      }
      if (input.wait) {
        await new Promise((resolve) => setTimeout(resolve, input.wait))
      }
      if (input.renew) {
        renewStateToken()
      }
      if (input.swap) {
        swapStrategy(input.swap)
      }
      if (input.fail) {
        throw new Error('step failed')
      }
    },
  })
  for (const step of ['profile', 'confirm']) {
    app.step(step, { handler: () => (useWfState().input() ? undefined : outletHttp({ step })) })
  }
  app.flow('invite', ['password', 'profile', 'confirm'])
  app.flow('short', ['password'])
  return createOutletHandler(app)
}

interface Sent {
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- tests read arbitrary response shapes
  result?: any
  /** the state token the response hands out (body `wfs` or the `wfs` Set-Cookie) */
  token?: string
  /** whether the response set a `wfs` cookie */
  cookie: boolean
  error?: Error & { body?: { statusCode?: number; code?: string } }
}

/** POSTs `body` to the trigger, sending `token` the way `config.token.write` hands it out. */
function caller(config: WfOutletTriggerConfig, handle = makeHandle()) {
  const viaCookie = config.token?.write === 'cookie'
  return (body: Record<string, unknown>, token?: string): Promise<Sent> =>
    prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token && viaCookie ? { cookie: `wfs=${token}` } : {}),
      },
      rawBody: JSON.stringify(token && !viaCookie ? { ...body, wfs: token } : body),
    })(async () => {
      const cookie = () => useResponse().getCookie('wfs')?.value
      try {
        const result = await handle(config)
        const fromBody = (result as { wfs?: string } | undefined)?.wfs
        return { result, token: fromBody ?? cookie(), cookie: cookie() !== undefined }
      } catch (error) {
        return { error: error as Sent['error'], cookie: cookie() !== undefined }
      }
    })
}

/**
 * A memory-backed HandleStateStrategy (a finite TTL keeps expiries known, as restoreOnError
 * needs) that records every handle `persist()` returned.
 */
function recording() {
  const inner = new HandleStateStrategy({ store: new WfStateStoreMemory(), defaultTtl: 60_000 })
  const handles: string[] = []
  const strategy: WfStateStrategy = {
    persist: async (state, options, overrides) => {
      const handle = await inner.persist(state, options, overrides)
      handles.push(handle)
      return handle
    },
    persistEntry: (state, options, overrides) => inner.persistEntry(state, options, overrides),
    retrieve: (token) => inner.retrieve(token),
    consume: (token) => inner.consume(token),
    consumeEntry: (token) => inner.consumeEntry(token),
  }
  return { strategy, handles }
}

const http = createHttpOutlet()

describe('renewStateToken() — durable handle strategy', () => {
  it('without it the incoming token is re-used for the next pause (control)', async () => {
    const { strategy } = recording()
    const post = caller({ state: strategy, outlets: [http] })
    const start = await post({ wfid: 'invite' })
    const next = await post({ input: { password: 'pw' } }, start.token)
    expect(next.result.step).toBe('profile')
    expect(next.token).toBe(start.token)
  })

  it('the response carries a new token; the old one answers 410 WF_EXPIRED, the new one continues', async () => {
    const { strategy } = recording()
    const post = caller({ state: strategy, outlets: [http] })
    const start = await post({ wfid: 'invite' })

    const renewed = await post({ input: { password: 'pw', renew: true } }, start.token)
    expect(renewed.result.step).toBe('profile')
    expect(renewed.token).toMatch(/^default\./)
    expect(renewed.token).not.toBe(start.token)
    // The incoming handle was consumed on resume and never written again.
    expect(await strategy.retrieve(rawHandle(start.token))).toBeNull()

    const replay = await post({ input: {} }, start.token)
    expect(replay.error?.body).toMatchObject({ statusCode: 410, code: 'WF_EXPIRED' })

    const next = await post({ input: {} }, renewed.token)
    expect(next.result.step).toBe('confirm')
  })

  it('later pauses re-use the new token (refresh, advance), until the flow finishes', async () => {
    const { strategy, handles } = recording()
    const post = caller({ state: strategy, outlets: [http] })
    const start = await post({ wfid: 'invite' })
    const renewed = await post({ input: { password: 'pw', renew: true } }, start.token)
    expect(renewed.token).not.toBe(start.token)

    const refresh = await post({}, renewed.token)
    expect(refresh.result.step).toBe('profile')
    expect(refresh.token).toBe(renewed.token)

    const advance = await post({ input: {} }, renewed.token)
    expect(advance.result.step).toBe('confirm')
    expect(advance.token).toBe(renewed.token)

    // two handles ever: the one minted on start, the one minted by the renewal
    expect(new Set(handles)).toEqual(new Set([rawHandle(start.token), rawHandle(renewed.token)]))

    expect((await post({ input: {} }, renewed.token)).result).toEqual({ finished: true })
    const after = await post({}, renewed.token)
    expect(after.error?.body?.code).toBe('WF_EXPIRED')
  })

  it('cookie transport: the new token is set as the cookie; the old cookie is refused', async () => {
    const { strategy } = recording()
    const post = caller({
      state: strategy,
      outlets: [http],
      token: { write: 'cookie', read: ['cookie'] },
    })
    const start = await post({ wfid: 'invite' })
    expect(start.cookie).toBe(true)
    expect(start.result.wfs).toBeUndefined()

    const renewed = await post({ input: { password: 'pw', renew: true } }, start.token)
    expect(renewed.cookie).toBe(true)
    expect(renewed.result.wfs).toBeUndefined()
    expect(renewed.token).toMatch(/^default\./)
    expect(renewed.token).not.toBe(start.token)

    const replay = await post({ input: {} }, start.token)
    expect(replay.error?.body).toMatchObject({ statusCode: 410, code: 'WF_EXPIRED' })

    const next = await post({ input: {} }, renewed.token)
    expect(next.result.step).toBe('confirm')
    expect(next.token).toBe(renewed.token)
  })

  it('a run that finishes in the same request persists nothing', async () => {
    const { strategy, handles } = recording()
    const post = caller({ state: strategy, outlets: [http] })
    const start = await post({ wfid: 'short' })
    expect(handles).toHaveLength(1)

    const done = await post({ input: { password: 'pw', renew: true } }, start.token)
    expect(done.result).toEqual({ finished: true })
    expect(done.token).toBeUndefined()
    expect(done.cookie).toBe(false)
    expect(handles).toHaveLength(1)
    expect(await strategy.retrieve(rawHandle(start.token))).toBeNull()
  })

  it('two concurrent resumes of one token: one gets the new token, the other 410', async () => {
    const { strategy } = recording()
    const post = caller({ state: strategy, outlets: [http] })
    const start = await post({ wfid: 'invite' })

    const results = await Promise.all([
      post({ input: { password: 'a', renew: true, wait: 10 } }, start.token),
      post({ input: { password: 'b', renew: true, wait: 10 } }, start.token),
    ])
    const won = results.filter((r) => r.result)
    const lost = results.filter((r) => r.error)
    expect(won).toHaveLength(1)
    expect(won[0].result.step).toBe('profile')
    expect(won[0].token).not.toBe(start.token)
    expect(lost).toHaveLength(1)
    expect(lost[0].error?.body?.code).toBe('WF_EXPIRED')
    expect((await post({}, start.token)).error?.body?.code).toBe('WF_EXPIRED')
    expect((await post({}, won[0].token)).result.step).toBe('profile')
  })

  for (const swapTo of ['other', 'default'] as const) {
    it(`with swapStrategy('${swapTo}') in the same request: a fresh handle in the final strategy`, async () => {
      const def = recording()
      const other = recording()
      const post = caller({
        state: { strategies: { default: def.strategy, other: other.strategy }, default: 'default' },
        outlets: [http],
      })
      const start = await post({ wfid: 'invite' })

      const renewed = await post(
        { input: { password: 'pw', renew: true, swap: swapTo } },
        start.token,
      )
      expect(renewed.result.step).toBe('profile')
      expect(renewed.token?.startsWith(`${swapTo}.`)).toBe(true)
      expect(rawHandle(renewed.token)).not.toBe(rawHandle(start.token))
      expect((await post({}, start.token)).error?.body?.code).toBe('WF_EXPIRED')
      expect((await post({ input: {} }, renewed.token)).result.step).toBe('confirm')
    })
  }
})

describe('renewStateToken() — restoreOnError', () => {
  it('a failure after the renewed pause was persisted discards it and restores the old state under the OLD token', async () => {
    const { strategy, handles } = recording()
    let failRender = false
    const post = caller({
      state: strategy,
      outlets: [http],
      restoreOnError: true,
      renderEnvelope: (envelope) => {
        if (failRender) {
          throw new Error('render failed')
        }
        return envelope
      },
    })
    const start = await post({ wfid: 'invite' })

    failRender = true
    const failed = await post({ input: { password: 'pw', renew: true } }, start.token)
    expect(failed.error?.message).toBe('render failed')
    expect(failed.cookie).toBe(false)
    // the renewed pause went under a fresh handle, discarded with the failed request
    expect(handles).toHaveLength(2)
    expect(handles[1]).not.toBe(rawHandle(start.token))
    expect(await strategy.retrieve(handles[1])).toBeNull()
    // the old token points at the state it pointed at before the request
    expect(await strategy.retrieve(rawHandle(start.token))).toMatchObject({
      schemaId: 'invite',
      indexes: [0],
    })

    failRender = false
    const retry = await post({ input: { password: 'pw', renew: true } }, start.token)
    expect(retry.result.step).toBe('profile')
    expect(retry.token).not.toBe(start.token)
    expect((await post({}, start.token)).error?.body?.code).toBe('WF_EXPIRED')
  })

  it('a step that throws after renewStateToken() restores the old state under the OLD token', async () => {
    const { strategy } = recording()
    const post = caller({ state: strategy, outlets: [http], restoreOnError: true })
    const start = await post({ wfid: 'invite' })

    const failed = await post({ input: { password: 'pw', renew: true, fail: true } }, start.token)
    expect(failed.error?.message).toBe('step failed')
    expect(await strategy.retrieve(rawHandle(start.token))).toMatchObject({ indexes: [0] })

    const retry = await post({ input: { password: 'pw', renew: true } }, start.token)
    expect(retry.result.step).toBe('profile')
    expect(retry.token).not.toBe(start.token)
  })
})

describe('renewStateToken() — encapsulated strategy', () => {
  it('changes nothing: every pause gets a new token anyway, and the old one is not invalidated', async () => {
    const strategy = new EncapsulatedStateStrategy({ secret: randomBytes(32) })
    const post = caller({ state: strategy, outlets: [http] })
    const start = await post({ wfid: 'invite' })

    for (const renew of [true, false]) {
      const next = await post({ input: { password: 'pw', renew } }, start.token)
      expect(next.result.step).toBe('profile')
      expect(next.token).toMatch(/^default\./)
      expect(next.token).not.toBe(start.token)
    }
  })
})

describe('renewStateToken() — outside a workflow run', () => {
  it('throws in an HTTP handler', () => {
    prepareTestHttpContext({ url: '/x' })(() => {
      expect(() => renewStateToken()).toThrow('renewStateToken: call it inside a workflow step')
      expect(() => useWfStrategy().renewToken()).toThrow(/inside a workflow step/)
    })
  })

  it('throws without any event context', () => {
    expect(() => renewStateToken()).toThrow('No active event context')
  })

  it('swapStrategy() and useWfStrategy().current() throw in an HTTP handler too', () => {
    prepareTestHttpContext({ url: '/x' })(() => {
      expect(() => swapStrategy('kv')).toThrow('swapStrategy: call it inside a workflow step')
      expect(() => useWfStrategy().current()).toThrow(/inside a workflow step/)
    })
  })
})

describe('renewStateToken() — paused output (offline drivers)', () => {
  it('flags output.inputRequired.renewStateToken on a copy of the outlet object the step returned', async () => {
    const app = createWfApp<Record<string, unknown>>({ logger: quietLogger })
    const shared = outletHttp({ step: 'x' })
    app.step('ask', {
      handler: () => {
        if (useWfState().input<Input>()?.renew) {
          renewStateToken()
        }
        return shared
      },
    })
    app.flow('ask', ['ask'])

    const renewed = await app.start('ask', {}, { input: { renew: true } })
    expect((renewed.inputRequired as WfPauseRequest).renewStateToken).toBe(true)
    expect((shared.inputRequired as WfPauseRequest).renewStateToken).toBeUndefined()

    const plain = await app.start('ask', {})
    expect((plain.inputRequired as WfPauseRequest).renewStateToken).toBeUndefined()
  })

  it('a renewal never crosses into a nested run, nor out of one', async () => {
    const app = createWfApp<Record<string, unknown>>({ logger: quietLogger })
    let inner: { inputRequired?: unknown } | undefined
    app.step('inner-renews', { handler: () => renewStateToken() ?? outletHttp({}) })
    app.step('inner-plain', { handler: () => outletHttp({}) })
    app.flow('inner-renews', ['inner-renews'])
    app.flow('inner-plain', ['inner-plain'])
    app.step('outer-renews', {
      handler: async () => {
        renewStateToken()
        inner = await app.start('inner-plain', {}, { eventContext: current() })
        return outletHttp({})
      },
    })
    app.step('outer-plain', {
      handler: async () => {
        inner = await app.start('inner-renews', {}, { eventContext: current() })
        return outletHttp({})
      },
    })
    app.flow('outer-renews', ['outer-renews'])
    app.flow('outer-plain', ['outer-plain'])

    const flag = (out: { inputRequired?: unknown } | undefined) =>
      (out?.inputRequired as WfPauseRequest | undefined)?.renewStateToken

    const a = await app.start('outer-renews', {})
    expect(flag(a)).toBe(true)
    expect(flag(inner)).toBeUndefined()

    const b = await app.start('outer-plain', {})
    expect(flag(b)).toBeUndefined()
    expect(flag(inner)).toBe(true)
  })
})
