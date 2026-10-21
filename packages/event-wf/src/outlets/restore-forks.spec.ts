import { EncapsulatedStateStrategy, HandleStateStrategy, outletHttp } from '@prostojs/wf/outlets'
import type {
  WfState,
  WfStateStore,
  WfStateStoreEntry,
  WfStateStrategy,
} from '@prostojs/wf/outlets'
import { prepareTestHttpContext, useResponse } from '@wooksjs/event-http'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearGlobalWooks } from 'wooks'

import { useWfState } from '../composables'
import { createWfApp } from '../wf-adapter'

import { createOutletHandler } from './create-handler'
import { createEmailOutlet, createHttpOutlet } from './create-outlet'
import {
  fail,
  failingHooks,
  failingHttpOutlet,
  failingPersist,
  faults,
  makeFaultApp,
  resetFaults,
} from './restore-test-kit'
import { postJson, quietLogger, rawHandle } from './test-utils'
import type { WfOutletTriggerConfig } from './types'
import { swapStrategy } from './use-wf-strategy'

/*
 * Review R2-M1 — a failed request never forks a workflow.
 *
 * Invariant, after ANY failure of a request that consumed a token (or started a flow):
 *  - at most ONE live continuation exists across every store: the restored old state (with
 *    `restoreOnError`), or the new state persisted under the SAME handle — never both, and never
 *    a state persisted under a new handle that the client was not given;
 *  - with `restoreOnError` there is exactly one;
 *  - the error response sets no state-token cookie;
 *  - the token the client holds works iff a continuation is live.
 */

/** A store whose live entries can be counted. */
class CountingStore implements WfStateStore {
  readonly map = new Map<string, WfStateStoreEntry>()
  async set(handle: string, state: WfState, expiresAt?: number) {
    this.map.set(handle, { state, expiresAt })
  }
  async get(handle: string) {
    return this.map.get(handle) ?? null
  }
  async delete(handle: string) {
    this.map.delete(handle)
  }
  async getAndDelete(handle: string) {
    const entry = this.map.get(handle) ?? null
    this.map.delete(handle)
    return entry
  }
}

function setup(restoreOnError: boolean, write: 'body' | 'cookie') {
  const stores = { default: new CountingStore(), other: new CountingStore() }
  const on = (store: CountingStore) => failingPersist(new HandleStateStrategy({ store }))
  const config: WfOutletTriggerConfig = {
    state: {
      strategies: { default: on(stores.default), other: on(stores.other) },
      default: 'default',
    },
    outlets: [failingHttpOutlet()],
    restoreOnError,
    token: { write, read: ['body', 'cookie'] },
    ...failingHooks(),
  }
  const handle = createOutletHandler(makeFaultApp())
  const live = () => stores.default.map.size + stores.other.map.size
  const call = (body: unknown) =>
    prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify(body),
    })(async () => {
      const cookies = () =>
        useResponse()
          .getSetCookieStrings()
          .filter((c) => c.startsWith('wfs='))
      try {
        const result = (await handle(config)) as Record<string, unknown>
        const fromCookie = cookies()[0]
        const token =
          (result?.wfs as string | undefined) ??
          (fromCookie
            ? decodeURIComponent(fromCookie.slice(4, fromCookie.indexOf(';')))
            : undefined)
        return { result, token, cookies: cookies() }
      } catch (error) {
        return { error: error as Error & { body?: { code?: string } }, cookies: cookies() }
      }
    })
  return { call, live }
}

interface Stage {
  name: string
  flow: 'one' | 'two'
  /** the new state is persisted before this stage fails */
  afterPersist?: boolean
}
const STAGES: Stage[] = [
  { name: 'resume', flow: 'two' },
  { name: 'before persist', flow: 'two' },
  { name: 'pause strategy', flow: 'two' },
  { name: 'unknown outlet', flow: 'two' },
  { name: 'persist', flow: 'two' },
  { name: 'deliver', flow: 'two', afterPersist: true },
  { name: 'render paused', flow: 'two', afterPersist: true },
  { name: 'render finished', flow: 'one' },
  { name: 'on finished', flow: 'one' },
]

beforeEach(() => {
  clearGlobalWooks()
  resetFaults()
})

describe('no fork after a failed resume', () => {
  for (const stage of STAGES) {
    for (const withSwap of stage.afterPersist || stage.name === 'persist'
      ? [false, true]
      : [false]) {
      for (const write of ['body', 'cookie'] as const) {
        for (const restoreOnError of [true, false]) {
          // the new state wins only when it went under the SAME handle the client holds
          const newStateLive = Boolean(stage.afterPersist) && !withSwap
          const expectedLive = newStateLive || restoreOnError ? 1 : 0
          it(`${stage.name}${withSwap ? ' (strategy swap)' : ''}, write ${write}, restoreOnError ${restoreOnError} → ${expectedLive} live`, async () => {
            const { call, live } = setup(restoreOnError, write)
            const started = await call({ wfid: stage.flow })
            expect(started.token).toBeTypeOf('string')
            expect(live()).toBe(1)

            faults.swap = withSwap
            faults.stage = stage.name
            const failed = await call({ wfs: started.token, input: { a: 1 } })
            expect(failed.error).toBeDefined()
            expect(failed.cookies, 'no token cookie on an error response').toEqual([])
            expect(live(), 'live continuations across all stores').toBe(expectedLive)

            faults.stage = undefined
            const retry = await call({ wfs: started.token, input: { a: 1 } })
            if (expectedLive === 1) {
              expect(retry.error, String(retry.error)).toBeUndefined()
            } else {
              expect(retry.error?.body?.code).toBe('WF_EXPIRED')
            }
          })
        }
      }
    }
  }
})

describe('no orphan after a failed start', () => {
  for (const stage of ['deliver', 'render paused']) {
    for (const write of ['body', 'cookie'] as const) {
      it(`${stage}, write ${write}: the state persisted for the start is discarded`, async () => {
        const { call, live } = setup(true, write)
        faults.stage = stage
        const failed = await call({ wfid: 'two' })
        expect(failed.error).toBeDefined()
        expect(failed.cookies).toEqual([])
        expect(live()).toBe(0)
      })
    }
  }
})

/*
 * Review R3-M1 — a delivered continuation is never thrown away, and a restore never runs next
 * to a state that could not be provably discarded.
 *  - out-of-band delivery succeeded (the token left in an email / SMS): the request is
 *    COMMITTED — a later failure neither discards nor restores; the delivered token is the one
 *    live continuation;
 *  - otherwise the new token never reached the client: the new state (persisted under a NEW
 *    handle) is discarded as cleanup — logged when that fails or cannot work (a throwing
 *    `consume`, a no-op one like EncapsulatedStateStrategy's) — and the old one is restored
 *    regardless (R4-L1): the client's own token is the one reachable continuation.
 */
describe('delivery commits; a restore needs a proven discard', () => {
  type OtherKind = 'handle' | 'discard throws' | 'encapsulated'
  const KINDS: OtherKind[] = ['handle', 'discard throws', 'encapsulated']

  function build(kind: OtherKind, delivery: 'caller' | 'out-of-band', restoreOnError: boolean) {
    const def = new HandleStateStrategy({ store: new CountingStore() })
    let other: WfStateStrategy
    if (kind === 'encapsulated') {
      other = new EncapsulatedStateStrategy({ secret: Buffer.alloc(32, 7) })
    } else {
      const inner = new HandleStateStrategy({ store: new CountingStore() })
      other = {
        persist: (state, opts, o) => inner.persist(state, opts, o),
        persistEntry: (state, opts, o) => inner.persistEntry(state, opts, o),
        retrieve: (t) => inner.retrieve(t),
        consumeEntry: (t) => inner.consumeEntry(t),
        consume: async (t) => {
          if (kind === 'discard throws' && faults.stage) {
            throw new Error('store down on discard')
          }
          return inner.consume(t)
        },
      }
    }
    const strategies: Record<string, WfStateStrategy> = { default: def, other }
    let deliveredToken: string | undefined
    const http = createHttpOutlet()
    const config: WfOutletTriggerConfig = {
      state: { strategies, default: 'default' },
      outlets: [
        {
          ...http,
          deliver: (req, token) => {
            if (req.outlet === 'http' && (req.payload as { step?: string })?.step === 'ask2') {
              deliveredToken = token
              fail('deliver')
            }
            return http.deliver(req, token)
          },
        },
        createEmailOutlet(async ({ token }) => {
          deliveredToken = token
          fail('deliver')
        }),
      ],
      restoreOnError,
      renderEnvelope: (envelope, info) => {
        fail(info.phase === 'paused' ? 'render paused' : 'render finished')
        return envelope
      },
    }
    const app = createWfApp<Record<string, unknown>>({ logger: quietLogger })
    app.step('ask', {
      handler: () => (useWfState().input() ? undefined : outletHttp({ step: 'ask' })),
    })
    app.step('ask2', {
      handler: () => {
        if (useWfState().input()) {
          return
        }
        swapStrategy('other')
        return delivery === 'caller'
          ? outletHttp({ step: 'ask2' })
          : { inputRequired: { outlet: 'email', target: 'u@example.com', template: 'next' } }
      },
    })
    app.flow('two', ['ask', 'ask2'])
    const handle = createOutletHandler(app)
    const call = (body: unknown) => postJson(() => handle(config), body)
    const isLive = async (token: string | undefined) =>
      Boolean(token && (await strategies[token.split('.')[0]].retrieve(rawHandle(token))))
    return { call, isLive, delivered: () => deliveredToken }
  }

  for (const kind of KINDS) {
    for (const delivery of ['caller', 'out-of-band'] as const) {
      for (const failAt of ['deliver', 'render paused'] as const) {
        for (const restoreOnError of [true, false]) {
          const committed = delivery === 'out-of-band' && failAt === 'render paused'
          const discardProven = kind === 'handle'
          // R4-L1: not committed → the new token never reached the client, so the old one is
          // restored even when the discard is unproven (the leftover is unreachable)
          const oldLive = !committed && restoreOnError
          const newLive = committed || !discardProven
          const label = committed ? 'delivered token' : oldLive ? 'restored token' : 'none'
          it(`${kind}, ${delivery}, fails at ${failAt}, restoreOnError ${restoreOnError} → reachable: ${label}`, async () => {
            const { call, isLive, delivered } = build(kind, delivery, restoreOnError)
            const started = await call({ wfid: 'two' })
            const oldToken = started.body?.wfs as string
            expect(oldToken).toBeTypeOf('string')
            faults.stage = failAt
            const failed = await call({ wfs: oldToken, input: { a: 1 } })
            expect(failed.error).toBeDefined()
            faults.stage = undefined
            const newToken = delivered()
            expect(newToken).toBeTypeOf('string')
            expect(await isLive(oldToken), 'old token live').toBe(oldLive)
            expect(await isLive(newToken), 'new state live').toBe(newLive)
            // reachable = live AND held by the client: the old token, or a token that left the
            // server (out-of-band delivery that succeeded)
            const reachable = (oldLive ? 1 : 0) + (committed && newLive ? 1 : 0)
            if (restoreOnError) {
              expect(reachable, 'exactly one reachable continuation').toBe(1)
            } else {
              expect(reachable).toBeLessThanOrEqual(1)
            }
          })
        }
      }
    }
  }
})
