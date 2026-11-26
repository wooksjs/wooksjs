import { randomBytes } from 'node:crypto'

import {
  EncapsulatedStateStrategy,
  HandleStateStrategy,
  WfStateStoreMemory,
  outletEmail,
  outletHttp,
} from '@prostojs/wf/outlets'
import type { WfStateStrategy } from '@prostojs/wf/outlets'
import { prepareTestHttpContext, useResponse } from '@wooksjs/event-http'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearGlobalWooks } from 'wooks'

import { useWfState } from '../composables'
import { createWfApp } from '../wf-adapter'

import { createOutletHandler } from './create-handler'
import { createEmailOutlet, createHttpOutlet } from './create-outlet'
import { quietLogger, rawHandle } from './test-utils'
import type { WfOutletTriggerConfig } from './types'
import { swapStrategy } from './use-wf-strategy'

/*
 * A pause whose token an outlet delivers OUT OF BAND (email, SMS) goes to another principal than
 * the HTTP caller. Its token must never be one the caller already holds — the caller of a resume
 * holds the incoming token — so such a pause always gets a fresh handle.
 */

beforeEach(() => clearGlobalWooks())

interface Ctx {
  email?: string
  invited?: boolean
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Flow `invite`: `admin-form` (HTTP pause for the invitee's email, filled by the admin; waits
 * `delay` ms on input) → `send-invite` (email pause; `swapStrategy(swapTo)` first when set;
 * re-sends on `{ resend }`) → `accept` (HTTP pause for the invitee).
 */
function makeHandle(opts: { swapTo?: string; delay?: number } = {}) {
  const app = createWfApp<Ctx>({ logger: quietLogger })
  app.step('admin-form', {
    handler: async () => {
      const { ctx, input } = useWfState()
      const data = input<{ email: string }>()
      if (!data) {
        return outletHttp({ step: 'admin-form' })
      }
      if (opts.delay) {
        await sleep(opts.delay)
      }
      ctx<Ctx>().email = data.email
    },
  })
  app.step('send-invite', {
    handler: () => {
      const { ctx, input } = useWfState()
      const context = ctx<Ctx>()
      if (context.invited && !input<{ resend?: boolean }>()?.resend) {
        return
      }
      context.invited = true
      if (opts.swapTo) {
        swapStrategy(opts.swapTo)
      }
      return outletEmail(context.email!, 'invite')
    },
  })
  app.step('accept', {
    handler: () => (useWfState().input() ? undefined : outletHttp({ step: 'accept' })),
  })
  app.flow('invite', ['admin-form', 'send-invite', 'accept'])
  return createOutletHandler(app)
}

/**
 * An email outlet that records every token it sent. `mode`: `'fail'` throws before sending,
 * `'fail-after-send'` sends and then throws.
 */
function mailbox() {
  const sent: string[] = []
  const box = {
    sent,
    mode: 'ok' as 'ok' | 'fail' | 'fail-after-send',
    outlet: createEmailOutlet(async ({ token }) => {
      if (box.mode === 'fail') {
        throw new Error('mail server down')
      }
      sent.push(token)
      if (box.mode === 'fail-after-send') {
        throw new Error('mail server timed out after accepting the message')
      }
    }),
  }
  return box
}

interface Sent {
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- tests read arbitrary response shapes
  result?: any
  /** the live state token the response hands out (body `wfs`, or a `wfs` cookie it sets) */
  token?: string
  /** the `wfs` Set-Cookie of the response: `'set'`, `'cleared'` (expired) or `'none'` */
  cookie: 'set' | 'cleared' | 'none'
  error?: Error & { body?: { statusCode?: number; code?: string } }
}

/**
 * POSTs `body` to the trigger, sending `token` the way `config.token.write` hands it out (`via`
 * overrides: `'body'` or `'cookie'`).
 */
function caller(config: WfOutletTriggerConfig, handle: ReturnType<typeof makeHandle>) {
  return (
    body: Record<string, unknown>,
    token?: string,
    via: 'body' | 'cookie' = config.token?.write === 'cookie' ? 'cookie' : 'body',
  ): Promise<Sent> =>
    prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token && via === 'cookie' ? { cookie: `wfs=${token}` } : {}),
      },
      rawBody: JSON.stringify(token && via === 'body' ? { ...body, wfs: token } : body),
    })(async () => {
      const read = (): Pick<Sent, 'token' | 'cookie'> => {
        const set = useResponse().getCookie('wfs')
        if (!set) {
          return { cookie: 'none' }
        }
        return set.attrs.maxAge === 0 ? { cookie: 'cleared' } : { cookie: 'set', token: set.value }
      }
      try {
        const result = await handle(config)
        const fromBody = (result as { wfs?: string } | undefined)?.wfs
        const fromCookie = read()
        return { result, ...fromCookie, token: fromBody ?? fromCookie.token }
      } catch (error) {
        return { error: error as Sent['error'], ...read() }
      }
    })
}

/** A memory-backed HandleStateStrategy (known expiry) recording every handle `persist()` returned. */
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

describe('out-of-band pause after a resume', () => {
  for (const write of ['body', 'cookie'] as const) {
    it(`never delivers the caller's token; the caller's token stops working (token.write ${write})`, async () => {
      const box = mailbox()
      const { strategy } = recording()
      const config: WfOutletTriggerConfig = {
        state: strategy,
        outlets: [createHttpOutlet(), box.outlet],
        token: { write, read: [write] },
      }
      const post = caller(config, makeHandle())

      const start = await post({ wfid: 'invite' })
      expect(start.result.step).toBe('admin-form')
      const adminToken = start.token!

      const invited = await post({ input: { email: 'invitee@example.com' } }, adminToken)
      expect(invited.result).toEqual({ sent: true, outlet: 'email' })
      expect(invited.token).toBeUndefined()
      expect(box.sent).toHaveLength(1)
      const emailed = box.sent[0]
      expect(emailed).toMatch(/^default\./)
      expect(emailed).not.toBe(adminToken)

      // The admin cannot continue the invitee's run.
      const replay = await post({}, adminToken)
      expect(replay.error?.body).toMatchObject({ statusCode: 410, code: 'WF_EXPIRED' })

      // The invitee can — and its in-band pauses re-use the emailed token as usual.
      const accept = await post({}, emailed)
      expect(accept.result.step).toBe('accept')
      expect(accept.token).toBe(emailed)
    })
  }

  it('also after a swapStrategy() to the strategy the run is already on', async () => {
    const box = mailbox()
    const config: WfOutletTriggerConfig = {
      state: {
        strategies: {
          enc: new EncapsulatedStateStrategy({ secret: randomBytes(32) }),
          store: recording().strategy,
        },
        default: 'store',
      },
      outlets: [createHttpOutlet(), box.outlet],
    }
    const post = caller(config, makeHandle({ swapTo: 'store' }))
    const start = await post({ wfid: 'invite' })
    expect(start.token).toMatch(/^store\./)

    await post({ input: { email: 'invitee@example.com' } }, start.token)
    expect(box.sent[0]).toMatch(/^store\./)
    expect(box.sent[0]).not.toBe(start.token)
    expect((await post({}, start.token)).error?.body?.code).toBe('WF_EXPIRED')
    expect((await post({}, box.sent[0])).result.step).toBe('accept')
  })

  it('a swapStrategy() from another strategy still mints in the new keyspace', async () => {
    const box = mailbox()
    const config: WfOutletTriggerConfig = {
      state: {
        strategies: {
          enc: new EncapsulatedStateStrategy({ secret: randomBytes(32) }),
          store: recording().strategy,
        },
        default: 'enc',
      },
      outlets: [createHttpOutlet(), box.outlet],
    }
    const post = caller(config, makeHandle({ swapTo: 'store' }))
    const start = await post({ wfid: 'invite' })
    expect(start.token).toMatch(/^enc\./)

    await post({ input: { email: 'invitee@example.com' } }, start.token)
    expect(box.sent[0]).toMatch(/^store\./)
    expect((await post({}, box.sent[0])).result.step).toBe('accept')
  })

  it('encapsulated strategy: the caller’s token replays the state before the step, never the recipient’s', async () => {
    const box = mailbox()
    const config: WfOutletTriggerConfig = {
      state: new EncapsulatedStateStrategy({ secret: randomBytes(32) }),
      outlets: [createHttpOutlet(), box.outlet],
    }
    const post = caller(config, makeHandle())
    const start = await post({ wfid: 'invite' })
    await post({ input: { email: 'invitee@example.com' } }, start.token)
    expect(box.sent[0]).not.toBe(start.token)

    // an encapsulated token cannot be invalidated: it still opens the admin form…
    expect((await post({}, start.token)).result.step).toBe('admin-form')
    // …while only the emailed one reaches the invitee's step
    expect((await post({}, box.sent[0])).result.step).toBe('accept')
  })

  it('only the holder of the latest link can resume (and re-send) from it; never the requesting page', async () => {
    const box = mailbox()
    const { strategy } = recording()
    const post = caller(
      { state: strategy, outlets: [createHttpOutlet(), box.outlet] },
      makeHandle(),
    )
    const start = await post({ wfid: 'invite' })
    await post({ input: { email: 'invitee@example.com' } }, start.token)

    // the requesting page cannot re-send
    expect((await post({ input: { resend: true } }, start.token)).error?.body?.code).toBe(
      'WF_EXPIRED',
    )
    expect(box.sent).toHaveLength(1)

    // the link holder can: a new link goes out and the previous one stops working
    const resent = await post({ input: { resend: true } }, box.sent[0])
    expect(resent.result).toEqual({ sent: true, outlet: 'email' })
    expect(box.sent).toHaveLength(2)
    expect(box.sent[1]).not.toBe(box.sent[0])
    expect((await post({}, box.sent[0])).error?.body?.code).toBe('WF_EXPIRED')
    expect((await post({}, box.sent[1])).result.step).toBe('accept')
  })

  it('two concurrent resumes with one token: one email with a fresh token, the other 410', async () => {
    const box = mailbox()
    const { strategy } = recording()
    const post = caller(
      { state: strategy, outlets: [createHttpOutlet(), box.outlet] },
      makeHandle({ delay: 10 }),
    )
    const start = await post({ wfid: 'invite' })

    const results = await Promise.all([
      post({ input: { email: 'a@example.com' } }, start.token),
      post({ input: { email: 'b@example.com' } }, start.token),
    ])
    const won = results.filter((r) => r.result)
    const lost = results.filter((r) => r.error)
    expect(won).toHaveLength(1)
    expect(won[0].result).toEqual({ sent: true, outlet: 'email' })
    expect(lost).toHaveLength(1)
    expect(lost[0].error?.body?.code).toBe('WF_EXPIRED')
    expect(box.sent).toHaveLength(1)
    expect(box.sent[0]).not.toBe(start.token)
    expect((await post({}, start.token)).error?.body?.code).toBe('WF_EXPIRED')
  })
})

describe('out-of-band pause — failures (restoreOnError)', () => {
  it('a failed delivery discards the fresh state and restores the caller’s token', async () => {
    const box = mailbox()
    const { strategy, handles } = recording()
    const post = caller(
      { state: strategy, outlets: [createHttpOutlet(), box.outlet], restoreOnError: true },
      makeHandle(),
    )
    const start = await post({ wfid: 'invite' })

    box.mode = 'fail'
    const failed = await post({ input: { email: 'invitee@example.com' } }, start.token)
    expect(failed.error?.message).toBe('mail server down')
    expect(handles).toHaveLength(2)
    expect(handles[1]).not.toBe(rawHandle(start.token))
    expect(await strategy.retrieve(handles[1])).toBeNull()
    expect(await strategy.retrieve(rawHandle(start.token))).toMatchObject({ indexes: [0] })

    box.mode = 'ok'
    const retried = await post({ input: { email: 'invitee@example.com' } }, start.token)
    expect(retried.result).toEqual({ sent: true, outlet: 'email' })
    expect(box.sent[0]).not.toBe(start.token)
  })

  it('a delivery that throws after the mail went out: the mailed link is dead, the caller’s token is restored', async () => {
    const box = mailbox()
    const { strategy } = recording()
    const post = caller(
      { state: strategy, outlets: [createHttpOutlet(), box.outlet], restoreOnError: true },
      makeHandle(),
    )
    const start = await post({ wfid: 'invite' })

    box.mode = 'fail-after-send'
    const failed = await post({ input: { email: 'invitee@example.com' } }, start.token)
    expect(failed.error?.message).toMatch(/timed out/)
    expect(box.sent).toHaveLength(1)
    // a throwing deliver() never committed the request: its state is discarded…
    expect((await post({}, box.sent[0])).error?.body?.code).toBe('WF_EXPIRED')
    // …and the caller's token, restored, is the one continuation
    expect((await post({}, start.token)).result.step).toBe('admin-form')
  })

  it('renderEnvelope throws after a successful send: the mailed link works, the caller’s token is 410 even under restoreOnError', async () => {
    const box = mailbox()
    const { strategy } = recording()
    let failRender = false
    const post = caller(
      {
        state: strategy,
        outlets: [createHttpOutlet(), box.outlet],
        restoreOnError: true,
        renderEnvelope: (envelope) => {
          if (failRender) {
            throw new Error('render failed')
          }
          return envelope
        },
      },
      makeHandle(),
    )
    const start = await post({ wfid: 'invite' })

    failRender = true
    const failed = await post({ input: { email: 'invitee@example.com' } }, start.token)
    expect(failed.error?.message).toBe('render failed')
    failRender = false
    expect(box.sent).toHaveLength(1)
    expect(box.sent[0]).not.toBe(start.token)
    // delivered out of band = committed: the mailed link is the continuation
    expect((await post({}, box.sent[0])).result.step).toBe('accept')
    expect((await post({}, start.token)).error?.body?.code).toBe('WF_EXPIRED')
  })

  it('without restoreOnError a failed delivery leaves no continuation: the caller cannot skip the undelivered email', async () => {
    const box = mailbox()
    const { strategy, handles } = recording()
    const post = caller(
      { state: strategy, outlets: [createHttpOutlet(), box.outlet] },
      makeHandle(),
    )
    const start = await post({ wfid: 'invite' })

    box.mode = 'fail'
    const failed = await post({ input: { email: 'invitee@example.com' } }, start.token)
    expect(failed.error?.message).toBe('mail server down')
    expect(await strategy.retrieve(handles[1])).toBeNull()
    // fail-closed, as for any failure after the token was consumed
    expect((await post({}, start.token)).error?.body?.code).toBe('WF_EXPIRED')
  })

  it('a start that pauses out of band mints a fresh token (unchanged)', async () => {
    const box = mailbox()
    const app = createWfApp({ logger: quietLogger })
    app.step('mail', {
      handler: () => (useWfState().resume ? undefined : outletEmail('a@example.com', 'hi')),
    })
    app.flow('mail', ['mail'])
    const post = caller(
      { state: recording().strategy, outlets: [box.outlet] },
      createOutletHandler(app),
    )
    const started = await post({ wfid: 'mail' })
    expect(started.result).toEqual({ sent: true, outlet: 'email' })
    expect(started.token).toBeUndefined()
    expect((await post({}, box.sent[0])).result).toEqual({ finished: true })
  })
})

describe('cookie transport — a spent token cookie is cleared', () => {
  const cookieConfig = (box = mailbox()): WfOutletTriggerConfig => ({
    state: recording().strategy,
    outlets: [createHttpOutlet(), box.outlet],
    token: { write: 'cookie' },
  })

  it('on an out-of-band pause the browser’s cookie (now dead) is expired, so the browser can start over', async () => {
    const post = caller(cookieConfig(), makeHandle())
    const start = await post({ wfid: 'invite' })
    expect(start.cookie).toBe('set')

    const invited = await post({ input: { email: 'invitee@example.com' } }, start.token)
    expect(invited.result).toEqual({ sent: true, outlet: 'email' })
    expect(invited.cookie).toBe('cleared')

    // without the cookie, a new start works
    expect((await post({ wfid: 'invite' })).result.step).toBe('admin-form')
  })

  it('on finish the cookie is expired', async () => {
    const box = mailbox()
    const post = caller(cookieConfig(box), makeHandle())
    const start = await post({ wfid: 'invite' })
    await post({ input: { email: 'invitee@example.com' } }, start.token)
    const accept = await post({}, box.sent[0])
    expect(accept.cookie).toBe('set')

    const done = await post({ input: { ok: true } }, accept.token)
    expect(done.result).toEqual({ finished: true })
    expect(done.cookie).toBe('cleared')
  })

  /** POSTs `body` with `wfs` in the body AND a `wfs` cookie; returns the response's `wfs` Set-Cookie. */
  const bodyAndCookie = (
    handle: ReturnType<typeof makeHandle>,
    config: WfOutletTriggerConfig,
    body: Record<string, unknown>,
    cookie: string | undefined,
  ) =>
    prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `wfs=${cookie}` },
      rawBody: JSON.stringify(body),
    })(async () => {
      const result = await handle(config)
      return { result, setCookie: useResponse().getCookie('wfs') }
    })

  it('also when the spent token came in the body while the same token sat in the cookie', async () => {
    const config = cookieConfig()
    const handle = makeHandle()
    const start = await caller(config, handle)({ wfid: 'invite' })
    const { result, setCookie } = await bodyAndCookie(
      handle,
      config,
      { wfs: start.token, input: { email: 'invitee@example.com' } },
      start.token,
    )
    expect(result).toEqual({ sent: true, outlet: 'email' })
    expect(setCookie).toMatchObject({ value: '', attrs: { maxAge: 0, path: '/' } })
  })

  it('a cookie holding another token is left alone', async () => {
    const config = cookieConfig()
    const handle = makeHandle()
    const post = caller(config, handle)
    const mine = await post({ wfid: 'invite' })
    const other = await post({ wfid: 'invite' })
    // the spent token arrives in the body; the browser's cookie holds another run's token
    const { result, setCookie } = await bodyAndCookie(
      handle,
      config,
      { wfs: mine.token, input: { email: 'invitee@example.com' } },
      other.token,
    )
    expect(result).toEqual({ sent: true, outlet: 'email' })
    expect(setCookie).toBeUndefined()
    expect((await post({}, other.token)).result.step).toBe('admin-form')
  })

  it('an in-band pause sets the new token; a failed request and a start that pauses out of band set no cookie', async () => {
    const box = mailbox()
    const post = caller(cookieConfig(box), makeHandle())
    const start = await post({ wfid: 'invite' })
    expect(start.cookie).toBe('set')

    box.mode = 'fail'
    const failed = await post({ input: { email: 'invitee@example.com' } }, start.token)
    expect(failed.error).toBeDefined()
    expect(failed.cookie).toBe('none')

    const app = createWfApp({ logger: quietLogger })
    app.step('mail', { handler: () => (useWfState().resume ? undefined : outletEmail('a', 'b')) })
    app.flow('mail', ['mail'])
    box.mode = 'ok'
    const started = await caller(cookieConfig(box), createOutletHandler(app))({ wfid: 'mail' })
    expect(started.result).toEqual({ sent: true, outlet: 'email' })
    expect(started.cookie).toBe('none')
  })
})

describe('cookie transport — a dead cookie never blocks a start', () => {
  const setup = (over: Partial<WfOutletTriggerConfig> = {}) => {
    const { strategy } = recording()
    const config: WfOutletTriggerConfig = {
      state: strategy,
      outlets: [createHttpOutlet(), mailbox().outlet],
      token: { write: 'cookie' },
      ...over,
    }
    return { strategy, config, post: caller(config, makeHandle()) }
  }

  it('a start ({ wfid }) over a cookie whose state is gone runs as a start', async () => {
    const { strategy, post } = setup()
    const start = await post({ wfid: 'invite' })
    await strategy.consume(rawHandle(start.token)) // the state expired / was revoked

    const again = await post({ wfid: 'invite' }, start.token)
    expect(again.result.step).toBe('admin-form')
    expect(again.cookie).toBe('set')
    expect(again.token).not.toBe(start.token)
  })

  it('also after the TTL ran out', async () => {
    const strategy = new HandleStateStrategy({ store: new WfStateStoreMemory(), defaultTtl: 1 })
    const post = caller(
      { state: strategy, outlets: [createHttpOutlet()], token: { write: 'cookie' } },
      makeHandle(),
    )
    const start = await post({ wfid: 'invite' })
    await sleep(5)
    expect((await post({ wfid: 'invite' }, start.token)).result.step).toBe('admin-form')
  })

  for (const bad of ['garbage', 'nope.x']) {
    it(`also over an invalid cookie '${bad}'`, async () => {
      const { post } = setup()
      expect((await post({ wfid: 'invite' }, bad)).result.step).toBe('admin-form')
    })
  }

  it('after a fail-closed failure the next start just works', async () => {
    const box = mailbox()
    const post = caller(
      {
        state: recording().strategy,
        outlets: [createHttpOutlet(), box.outlet],
        token: { write: 'cookie' },
      },
      makeHandle(),
    )
    const start = await post({ wfid: 'invite' })
    box.mode = 'fail'
    const failed = await post({ input: { email: 'invitee@example.com' } }, start.token)
    expect(failed.error?.message).toBe('mail server down')
    expect(failed.cookie).toBe('none') // the browser keeps its (now dead) cookie

    expect((await post({}, start.token)).error?.body?.code).toBe('WF_EXPIRED')
    expect((await post({ wfid: 'invite' }, start.token)).result.step).toBe('admin-form')
  })

  it('a resume (no wfid) over a dead cookie answers 410 and leaves the cookie alone', async () => {
    const { strategy, post } = setup()
    const start = await post({ wfid: 'invite' })
    await strategy.consume(rawHandle(start.token))
    const refused = await post({}, start.token)
    expect(refused.error?.body).toMatchObject({ statusCode: 410, code: 'WF_EXPIRED' })
    expect(refused.cookie).toBe('none')
    const invalid = await post({}, 'garbage')
    expect(invalid.error?.body?.code).toBe('WF_INVALID_TOKEN')
    expect(invalid.cookie).toBe('none')
  })

  it('a body or query token is never ignored, even with wfid', async () => {
    const { strategy, config, post } = setup()
    const start = await post({ wfid: 'invite' })
    await strategy.consume(rawHandle(start.token))
    const handle = makeHandle()
    for (const where of ['body', 'query'] as const) {
      const refused = await prepareTestHttpContext({
        url: where === 'query' ? `/wf?wfs=${start.token}` : '/wf',
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `wfs=${start.token}` },
        rawBody: JSON.stringify(
          where === 'body' ? { wfid: 'invite', wfs: start.token } : { wfid: 'invite' },
        ),
      })(async () => {
        try {
          await handle(config)
          return undefined
        } catch (error) {
          return (error as Sent['error'])?.body?.code
        }
      })
      expect(refused, where).toBe('WF_EXPIRED')
    }
  })

  it('a live cookie still wins over wfid; a cookie refused 403 is not ignored', async () => {
    const { config, post } = setup()
    const start = await post({ wfid: 'invite' })
    // live: the cookie's run is resumed, wfid is not used
    const resumed = await post({ wfid: 'invite', input: { email: 'x@example.com' } }, start.token)
    expect(resumed.result).toEqual({ sent: true, outlet: 'email' })

    const other = await post({ wfid: 'invite' })
    const strict = caller({ ...config, startOnly: ['invite'] }, makeHandle())
    const refused = await strict({ wfid: 'invite' }, other.token)
    expect(refused.error?.body?.code).toBe('WF_FORBIDDEN')
  })

  it('a start over a dead cookie that pauses out of band or finishes leaves the cookie alone', async () => {
    const box = mailbox()
    const app = createWfApp({ logger: quietLogger })
    app.step('mail', { handler: () => (useWfState().resume ? undefined : outletEmail('a', 'b')) })
    app.flow('mail', ['mail'])
    app.step('done', { handler: () => undefined })
    app.flow('done', ['done'])
    const post = caller(
      { state: recording().strategy, outlets: [box.outlet], token: { write: 'cookie' } },
      createOutletHandler(app),
    )
    const mailed = await post({ wfid: 'mail' }, 'default.gone')
    expect(mailed.result).toEqual({ sent: true, outlet: 'email' })
    expect(mailed.cookie).toBe('none')
    const done = await post({ wfid: 'done' }, 'default.gone')
    expect(done.result).toEqual({ finished: true })
    expect(done.cookie).toBe('none')
  })
})

describe('cookie transport — double submit and shared cookie names', () => {
  /** Flow `f`: `ask` (pause; on input waits 20 ms, throws once while `fail.once`) → `next` (pause). */
  function slowApp(fail: { once: boolean }) {
    const app = createWfApp({ logger: quietLogger })
    app.step('ask', {
      handler: async () => {
        if (!useWfState().input()) {
          return outletHttp({ step: 'ask' })
        }
        await sleep(20)
        if (fail.once) {
          fail.once = false
          throw new Error('db timeout')
        }
      },
    })
    app.step('next', {
      handler: () => (useWfState().input() ? undefined : outletHttp({ step: 'next' })),
    })
    app.flow('f', ['ask', 'next'])
    return createOutletHandler(app)
  }

  /** Two concurrent resumes with the browser's cookie; returns the cookie the browser ends with. */
  async function doubleSubmit(post: ReturnType<typeof caller>, cookie: string) {
    let jar: string | undefined = cookie
    const apply = (sent: Sent) => {
      if (sent.cookie === 'set') {
        jar = sent.token
      } else if (sent.cookie === 'cleared') {
        jar = undefined
      }
      return sent
    }
    const results = await Promise.all([
      post({ input: { v: 1 } }, cookie).then(apply),
      post({ input: { v: 1 } }, cookie).then(apply),
    ])
    return { results, jar }
  }

  it('DS1: the winner re-pauses in band — the browser keeps the live token', async () => {
    const { strategy } = recording()
    const post = caller(
      { state: strategy, outlets: [createHttpOutlet()], token: { write: 'cookie' } },
      slowApp({ once: false }),
    )
    const start = await post({ wfid: 'f' })
    const { results, jar } = await doubleSubmit(post, start.token!)
    expect(results.filter((r) => r.result?.step === 'next')).toHaveLength(1)
    expect(results.filter((r) => r.error?.body?.code === 'WF_EXPIRED')).toHaveLength(1)
    expect(jar).toBe(start.token)
    expect((await post({}, jar)).result.step).toBe('next')
  })

  it('DS2: the winner fails and restoreOnError restores the token — the browser keeps it', async () => {
    const { strategy } = recording()
    const post = caller(
      {
        state: strategy,
        outlets: [createHttpOutlet()],
        token: { write: 'cookie' },
        restoreOnError: true,
      },
      slowApp({ once: true }),
    )
    const start = await post({ wfid: 'f' })
    const { results, jar } = await doubleSubmit(post, start.token!)
    expect(results.map((r) => r.error?.message ?? r.error?.body?.code).toSorted()).toEqual([
      'Invalid or expired workflow state',
      'db timeout',
    ])
    expect(jar).toBe(start.token)
    expect(await strategy.retrieve(rawHandle(jar))).not.toBeNull()
    expect((await post({ input: { v: 1 } }, jar)).result.step).toBe('next')
  })

  it('SHARED: two triggers with one cookie name and separate state overwrite each other’s cookie', async () => {
    const handle = slowApp({ once: false })
    const x = caller(
      { state: recording().strategy, outlets: [createHttpOutlet()], token: { write: 'cookie' } },
      handle,
    )
    const y = caller(
      { state: recording().strategy, outlets: [createHttpOutlet()], token: { write: 'cookie' } },
      handle,
    )
    const onX = await x({ wfid: 'f' })
    // Y does not know X's token: as a start, it ignores that cookie and starts its own run —
    // whose in-band pause replaces the browser's cookie (give each trigger its own token.name)
    const onY = await y({ wfid: 'f' }, onX.token)
    expect(onY.result.step).toBe('ask')
    expect(onY.cookie).toBe('set')
    expect(onY.token).not.toBe(onX.token)
    // a resume on Y with X's cookie is refused and leaves the cookie alone; X's run is still live
    const resumeOnY = await y({}, onX.token)
    expect(resumeOnY.error?.body?.code).toBe('WF_EXPIRED')
    expect(resumeOnY.cookie).toBe('none')
    expect((await x({}, onX.token)).result.step).toBe('ask')
  })
})
