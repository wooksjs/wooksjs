import { EventContext, run } from '@wooksjs/event-core'
import { prepareTestHttpContext, useResponse } from '@wooksjs/event-http'
import { HandleStateStrategy, WfStateStoreMemory, outlet, outletEmail, outletHttp } from '@prostojs/wf/outlets'
import type { WfOutlet, WfStateStrategy } from '@prostojs/wf/outlets'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGlobalWooks } from 'wooks'

import { createWfApp } from '../wf-adapter'
import { useWfState } from '../composables'

import { createEmailOutlet, createHttpOutlet } from './create-outlet'
import { createOutletHandler } from './create-handler'
import { outletsRegistryKey } from './outlet-context'
import { handleWfOutletRequest } from './trigger'
import type { WfOutletTriggerConfig, WfOutletTriggerDeps } from './types'
import { useWfFinished } from './use-wf-finished'
import { useWfOutlet } from './use-wf-outlet'
import { swapStrategy, useWfStrategy } from './use-wf-strategy'

// Every test below builds its app inside the `it()` body, and they reuse step
// ids (e.g. `pause`, `first-pause`) across cases. Step ids live on a shared,
// process-global router, so without a reset the second registration of an id is
// silently ignored (first-win) and now warns. Reset the router before each test
// to keep them hermetic.
beforeEach(() => clearGlobalWooks())

function createTestStore() {
  return new WfStateStoreMemory()
}

function createTestStrategy(store?: WfStateStoreMemory) {
  return new HandleStateStrategy({ store: store ?? createTestStore() })
}

function createTestWfApp() {
  const app = createWfApp<{ result?: number }>()

  app.step('complete', {
    handler: () => {
      const { ctx } = useWfState()
      ctx<{ result?: number }>().result = 42
    },
  })

  app.step('ask-input', {
    handler: () => {
      const { input } = useWfState()
      if (input()) { return }
      return outletHttp({ fields: ['email', 'password'] })
    },
  })

  app.step('send-email', {
    handler: () => {
      const { input } = useWfState()
      if (input()) { return }
      return outletEmail('user@test.com', 'verify')
    },
  })

  app.step('finish-redirect', {
    handler: () => {
      useWfFinished().set({ type: 'redirect', value: '/dashboard' })
    },
  })

  app.step('finish-data', {
    handler: () => {
      useWfFinished().set({ type: 'data', value: { success: true } })
    },
  })

  app.step('use-input', {
    handler: () => {
      const { ctx, input } = useWfState()
      const i = input<{ email: string }>()
      if (i) {
        ctx<{ result?: number }>().result = 100
      }
    },
  })

  app.step('validate-retry', {
    handler: () => {
      const { input } = useWfState()
      const i = input<{ password?: string }>()
      if (i?.password === 'good') { return }
      return outletHttp({ fields: ['password'] }, { error: 'bad password' })
    },
  })

  app.step('throws-on-input', {
    handler: () => {
      const { input } = useWfState()
      if (input()) { throw new Error('step exploded') }
      return outletHttp({ fields: ['anything'] })
    },
  })

  app.step('first-pause', {
    handler: () => {
      const { input } = useWfState()
      if (input()) { return }
      return outletHttp({ fields: ['step-one'] })
    },
  })

  app.step('second-pause', {
    handler: () => {
      const { input } = useWfState()
      if (input()) { return }
      return outletHttp({ fields: ['step-two'] })
    },
  })

  app.flow('simple', ['complete'])
  app.flow('with-http-outlet', ['ask-input', 'use-input'])
  app.flow('with-email-outlet', ['send-email', 'use-input'])
  app.flow('redirect-flow', ['complete', 'finish-redirect'])
  app.flow('data-flow', ['complete', 'finish-data'])
  app.flow('retry-flow', ['validate-retry'])
  app.flow('throw-flow', ['throws-on-input'])
  app.flow('two-pause-form', ['first-pause', 'second-pause'])

  return app
}

function makeDeps(app: {
  start: (...args: any[]) => any
  resume: (...args: any[]) => any
}): WfOutletTriggerDeps {
  return {
    start: (schemaId, context, opts) => app.start(schemaId, context as any, opts as any),
    resume: (state, opts) => app.resume(state as any, opts as any),
  }
}

function postWf(body: unknown, extraHeaders?: Record<string, string>) {
  return prepareTestHttpContext({
    url: '/wf',
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    rawBody: JSON.stringify(body),
  })
}

describe('useWfFinished', () => {
  it('set() stores and get() retrieves response', () => {
    const ctx = new EventContext({ logger: console as any })
    run(ctx, () => {
      const { set, get } = useWfFinished()
      expect(get()).toBeUndefined()
      set({ type: 'data', value: { ok: true } })
      expect(get()).toEqual({ type: 'data', value: { ok: true } })
    })
  })

  it('get() returns undefined when nothing set', () => {
    const ctx = new EventContext({ logger: console as any })
    run(ctx, () => {
      expect(useWfFinished().get()).toBeUndefined()
    })
  })
})

describe('useWfOutlet', () => {
  it('getOutlet returns registered outlet', () => {
    const ctx = new EventContext({ logger: console as any })
    const httpOutlet = createHttpOutlet()
    const registry = new Map([['http', httpOutlet]])
    ctx.set(outletsRegistryKey, registry)

    run(ctx, () => {
      expect(useWfOutlet().getOutlet('http')).toBe(httpOutlet)
    })
  })

  it('getOutlet returns null for unknown', () => {
    const ctx = new EventContext({ logger: console as any })
    ctx.set(outletsRegistryKey, new Map())

    run(ctx, () => {
      expect(useWfOutlet().getOutlet('unknown')).toBeNull()
    })
  })

})

describe('createHttpOutlet', () => {
  it('delivers payload as response', async () => {
    const outlet = createHttpOutlet()
    const result = await outlet.deliver(
      { outlet: 'http', payload: { fields: ['email'] } },
      'token123',
    )
    expect(result?.response).toEqual({ fields: ['email'] })
  })

  it('merges context into response', async () => {
    const outlet = createHttpOutlet()
    const result = await outlet.deliver(
      { outlet: 'http', payload: { fields: ['email'] }, context: { step: 'login' } },
      'token123',
    )
    expect(result?.response).toEqual({ fields: ['email'], step: 'login' })
  })

  it('applies custom transform', async () => {
    const outlet = createHttpOutlet({
      transform: (payload, ctx) => ({ transformed: true, ...(payload as any), ...ctx }),
    })
    const result = await outlet.deliver(
      { outlet: 'http', payload: { fields: ['email'] }, context: { step: 'login' } },
      'token123',
    )
    expect(result?.response).toEqual({ transformed: true, fields: ['email'], step: 'login' })
  })

  it('declares tokenDelivery: "caller"', () => {
    const outlet = createHttpOutlet()
    expect(outlet.tokenDelivery).toBe('caller')
  })
})

describe('createEmailOutlet', () => {
  it('calls send function with correct args', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const outlet = createEmailOutlet(send)
    await outlet.deliver(
      { outlet: 'email', target: 'a@b.com', template: 'verify', context: { name: 'Alice' } },
      'tok',
    )
    expect(send).toHaveBeenCalledWith({
      target: 'a@b.com',
      template: 'verify',
      context: { name: 'Alice' },
      token: 'tok',
    })
  })

  it('returns sent acknowledgement', async () => {
    const outlet = createEmailOutlet(vi.fn().mockResolvedValue(undefined))
    const result = await outlet.deliver({ outlet: 'email' }, 'tok')
    expect(result?.response).toEqual({ sent: true, outlet: 'email' })
  })

  it('declares tokenDelivery: "out-of-band"', () => {
    const outlet = createEmailOutlet(vi.fn().mockResolvedValue(undefined))
    expect(outlet.tokenDelivery).toBe('out-of-band')
  })
})

describe('handleWfOutletRequest', () => {
  const httpOutlet = createHttpOutlet()
  const emailSend = vi.fn().mockResolvedValue(undefined)
  const emailOutlet = createEmailOutlet(emailSend)

  function makeConfig(overrides?: Partial<WfOutletTriggerConfig>): WfOutletTriggerConfig {
    return {
      state: createTestStrategy(),
      outlets: [httpOutlet, emailOutlet],
      ...overrides,
    }
  }

  it('starts and finishes workflow (happy path)', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig()

    const runCtx = postWf({ wfid: 'simple' })

    const result = await runCtx(() => handleWfOutletRequest(config, deps))
    expect(result).toEqual({ finished: true })
  })

  it('starts with initialContext', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig({
      initialContext: (body, wfid) => ({ result: 99 }),
      onFinished: (ctx) => ({ context: ctx.context }),
    })

    const runCtx = postWf({ wfid: 'simple' })

    const result = await runCtx(() => handleWfOutletRequest(config, deps)) as any
    expect(result.context.result).toBe(42)
  })

  it('pauses workflow with HTTP outlet and returns form + token', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig()

    const runCtx = postWf({ wfid: 'with-http-outlet' })

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
    expect(result.fields).toEqual(['email', 'password'])
    expect(result.wfs).toBeDefined()
    expect(typeof result.wfs).toBe('string')
  })

  it('resumes workflow with token', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const store = createTestStore()
    const strategy = new HandleStateStrategy({ store })
    const config = makeConfig({ state: strategy })

    const runCtx1 = postWf({ wfid: 'with-http-outlet' })
    const startResult = (await runCtx1(() => handleWfOutletRequest(config, deps))) as any
    const token = startResult.wfs

    const runCtx2 = postWf({ wfs: token, input: { email: 'a@b.com' } })
    const resumeResult = await runCtx2(() => handleWfOutletRequest(config, deps))
    expect(resumeResult).toEqual({ finished: true })
  })

  it('returns 410 for expired/invalid token', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig()

    const runCtx = postWf({ wfs: 'invalid-token' })

    const result = (await runCtx(async () => {
      const r = await handleWfOutletRequest(config, deps)
      return { body: r as any, status: useResponse().status }
    })) as any
    expect(result.body.error).toBeDefined()
    expect(result.body.status).toBeUndefined()
    expect(result.status).toBe(410)
  })

  it('returns 403 for disallowed wfid', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig({ allow: ['other-flow'] })

    const runCtx = postWf({ wfid: 'simple' })

    const result = (await runCtx(async () => {
      const r = await handleWfOutletRequest(config, deps)
      return { body: r as any, status: useResponse().status }
    })) as any
    expect(result.body.status).toBeUndefined()
    expect(result.status).toBe(403)
  })

  it('returns 403 for blocked wfid', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig({ block: ['simple'] })

    const runCtx = postWf({ wfid: 'simple' })

    const result = (await runCtx(async () => {
      const r = await handleWfOutletRequest(config, deps)
      return { body: r as any, status: useResponse().status }
    })) as any
    expect(result.body.status).toBeUndefined()
    expect(result.status).toBe(403)
  })

  it('returns 400 when missing both wfs and wfid', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig()

    const runCtx = postWf({})

    const result = (await runCtx(async () => {
      const r = await handleWfOutletRequest(config, deps)
      return { body: r as any, status: useResponse().status }
    })) as any
    expect(result.body.status).toBeUndefined()
    expect(result.status).toBe(400)
  })

  it('returns 500 for unknown outlet', async () => {
    const app = createWfApp()
    app.step('unknown-outlet', {
      handler: () => ({ inputRequired: { outlet: 'nonexistent' } }),
    })
    app.flow('unknown-outlet-flow', ['unknown-outlet'])
    const deps = makeDeps(app)
    const config = makeConfig()

    const runCtx = postWf({ wfid: 'unknown-outlet-flow' })

    const result = (await runCtx(async () => {
      const r = await handleWfOutletRequest(config, deps)
      return { body: r as any, status: useResponse().status }
    })) as any
    expect(result.body.status).toBeUndefined()
    expect(result.body.error).toContain('nonexistent')
    expect(result.status).toBe(500)
  })

  it('sets HTTP status + Location header for redirect-on-finish', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig()

    const runCtx = postWf({ wfid: 'redirect-flow' })

    const result = (await runCtx(async () => {
      const r = await handleWfOutletRequest(config, deps)
      const res = useResponse()
      return { body: r, status: res.status, location: res.getHeader('location') }
    })) as any
    expect(result.body).toBe('')
    expect(result.status).toBe(302)
    expect(result.location).toBe('/dashboard')
  })

  it('uses onFinished callback when provided', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig({
      onFinished: ({ context, schemaId }) => ({ custom: true, schemaId }),
    })

    const runCtx = postWf({ wfid: 'simple' })

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
    expect(result).toEqual({ custom: true, schemaId: 'simple' })
  })

  it('reads wfid from query params', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig()

    const runCtx = prepareTestHttpContext({
      url: '/wf?wfid=simple',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({}),
    })

    const result = await runCtx(() => handleWfOutletRequest(config, deps))
    expect(result).toEqual({ finished: true })
  })

  it('reads token from cookie', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const store = createTestStore()
    const strategy = new HandleStateStrategy({ store })
    const config = makeConfig({ state: strategy })

    const runCtx1 = postWf({ wfid: 'with-http-outlet' })
    const startResult = (await runCtx1(() => handleWfOutletRequest(config, deps))) as any
    const token = startResult.wfs

    const runCtx2 = postWf({ input: { email: 'a@b.com' } }, { cookie: `wfs=${token}` })
    const resumeResult = await runCtx2(() => handleWfOutletRequest(config, deps))
    expect(resumeResult).toEqual({ finished: true })
  })

  it('does NOT merge token into body for out-of-band outlet', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig()

    const runCtx = postWf({ wfid: 'with-email-outlet' })

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
    expect(result).toEqual({ sent: true, outlet: 'email' })
    expect(result.wfs).toBeUndefined()
  })

  it('does NOT set cookie for out-of-band outlet when tokenWrite="cookie"', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const emailSendFn = vi.fn().mockResolvedValue(undefined)
    const config = makeConfig({
      outlets: [createHttpOutlet(), createEmailOutlet(emailSendFn)],
      token: { write: 'cookie' },
    })

    const runCtx = postWf({ wfid: 'with-email-outlet' })

    let wfsCookie: unknown
    const result = await runCtx(async () => {
      const r = await handleWfOutletRequest(config, deps)
      wfsCookie = useResponse().getCookie('wfs')
      return r
    })

    expect(result).toEqual({ sent: true, outlet: 'email' })
    expect(wfsCookie).toBeUndefined()
  })

  it('DOES set cookie for caller outlet when tokenWrite="cookie" (regression)', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig({ token: { write: 'cookie' } })

    const runCtx = postWf({ wfid: 'with-http-outlet' })

    let wfsCookie: unknown
    const result = (await runCtx(async () => {
      const r = await handleWfOutletRequest(config, deps)
      wfsCookie = useResponse().getCookie('wfs')
      return r
    })) as any

    expect(result.fields).toEqual(['email', 'password'])
    expect(result.wfs).toBeUndefined()
    expect(wfsCookie).toBeDefined()
  })

  // Custom-outlet tests: verify the gate is keyed on the declared
  // tokenDelivery, not on the outlet name. A name-based implementation
  // would still pass the email-specific tests above.

  function buildCustomOutletRig(
    outletDef: WfOutlet,
    args: unknown,
  ): { deps: WfOutletTriggerDeps; flowId: string } {
    const flowId = `${outletDef.name}-flow`
    const stepId = `${outletDef.name}-step`
    const app = createWfApp()
    app.step(stepId, {
      handler: () => {
        const { input } = useWfState()
        if (input()) { return }
        return outlet(outletDef.name, args)
      },
    })
    app.flow(flowId, [stepId])
    return { flowId, deps: makeDeps(app) }
  }

  const customOutOfBand: WfOutlet = {
    name: 'sms',
    tokenDelivery: 'out-of-band',
    async deliver() {
      return { response: { dispatched: 'sms' } }
    },
  }

  it('custom out-of-band outlet with default body-write: token not merged into body', async () => {
    const { deps, flowId } = buildCustomOutletRig(customOutOfBand, { target: '+1555' })
    const config: WfOutletTriggerConfig = {
      state: createTestStrategy(),
      outlets: [customOutOfBand],
    }

    const runCtx = postWf({ wfid: flowId })

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
    expect(result).toEqual({ dispatched: 'sms' })
    expect(result.wfs).toBeUndefined()
  })

  it('custom out-of-band outlet with cookie-write: token not set in cookie', async () => {
    const { deps, flowId } = buildCustomOutletRig(customOutOfBand, { target: '+1555' })
    const config: WfOutletTriggerConfig = {
      state: createTestStrategy(),
      outlets: [customOutOfBand],
      token: { write: 'cookie' },
    }

    const runCtx = postWf({ wfid: flowId })

    let wfsCookie: unknown
    const result = (await runCtx(async () => {
      const r = await handleWfOutletRequest(config, deps)
      wfsCookie = useResponse().getCookie('wfs')
      return r
    })) as any

    expect(result).toEqual({ dispatched: 'sms' })
    expect(wfsCookie).toBeUndefined()
  })

  it('custom outlet without tokenDelivery defaults to caller (merges into body)', async () => {
    const customDefault: WfOutlet = {
      name: 'custom-form',
      async deliver(req) {
        return { response: { form: (req as any).payload } }
      },
    }
    const { deps, flowId } = buildCustomOutletRig(customDefault, { payload: { fields: ['x'] } })
    const config: WfOutletTriggerConfig = {
      state: createTestStrategy(),
      outlets: [customDefault],
    }

    const runCtx = postWf({ wfid: flowId })

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
    expect(result.form).toEqual({ fields: ['x'] })
    expect(typeof result.wfs).toBe('string')
  })

  it('invalidates HTTP-outlet token after successful resume (single-use)', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const store = createTestStore()
    const strategy = new HandleStateStrategy({ store })
    const config = makeConfig({ state: strategy })

    const runCtx1 = postWf({ wfid: 'with-http-outlet' })
    const startResult = (await runCtx1(() => handleWfOutletRequest(config, deps))) as any
    const token = startResult.wfs

    const runCtx2 = postWf({ wfs: token, input: { email: 'a@b.com' } })
    const r1 = await runCtx2(() => handleWfOutletRequest(config, deps))
    expect(r1).toEqual({ finished: true })

    const runCtx3 = postWf({ wfs: token, input: { email: 'again@b.com' } })
    const r2 = (await runCtx3(async () => {
      const r = await handleWfOutletRequest(config, deps)
      return { body: r as any, status: useResponse().status }
    })) as any
    expect(r2.status).toBe(410)
    expect(r2.body.error).toBeDefined()
  })

  it('retriable pause keeps the same token across error retries', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const store = createTestStore()
    const strategy = new HandleStateStrategy({ store })
    const config = makeConfig({ state: strategy })

    const run1 = postWf({ wfid: 'retry-flow' })
    const r1 = (await run1(() => handleWfOutletRequest(config, deps))) as any
    expect(r1.fields).toEqual(['password'])
    const t1 = r1.wfs as string
    expect(typeof t1).toBe('string')

    const run2 = postWf({ wfs: t1, input: { password: 'wrong' } })
    const r2 = (await run2(() => handleWfOutletRequest(config, deps))) as any
    expect(r2.fields).toEqual(['password'])
    expect(r2.error).toBe('bad password')
    expect(r2.wfs).toBe(t1)

    const run3 = postWf({ wfs: t1, input: { password: 'good' } })
    const r3 = await run3(() => handleWfOutletRequest(config, deps))
    expect(r3).toEqual({ finished: true })

    // Token is gone after finish.
    const run4 = postWf({ wfs: t1 })
    const r4 = (await run4(async () => {
      const r = await handleWfOutletRequest(config, deps)
      return { body: r as any, status: useResponse().status }
    })) as any
    expect(r4.status).toBe(410)
  })

  it('refresh on a paused step preserves the URL token (no input)', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const store = createTestStore()
    const strategy = new HandleStateStrategy({ store })
    const config = makeConfig({ state: strategy })

    const run1 = postWf({ wfid: 'with-http-outlet' })
    const r1 = (await run1(() => handleWfOutletRequest(config, deps))) as any
    const t1 = r1.wfs as string
    expect(typeof t1).toBe('string')
    expect(r1.fields).toEqual(['email', 'password'])

    // Simulate browser refresh: same wfs, no input → re-pauses on same step.
    const run2 = postWf({ wfs: t1 })
    const r2 = (await run2(() => handleWfOutletRequest(config, deps))) as any
    expect(r2.fields).toEqual(['email', 'password'])
    expect(r2.wfs).toBe(t1)

    // Refresh again — still the same token.
    const run3 = postWf({ wfs: t1 })
    const r3 = (await run3(() => handleWfOutletRequest(config, deps))) as any
    expect(r3.wfs).toBe(t1)

    // Eventually submit with input → finishes; the original URL token is the
    // one the SPA actually used end-to-end.
    const run4 = postWf({ wfs: t1, input: { email: 'a@b.com' } })
    const r4 = await run4(() => handleWfOutletRequest(config, deps))
    expect(r4).toEqual({ finished: true })
  })

  it('multi-step advance preserves the URL token across paused steps', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const store = createTestStore()
    const strategy = new HandleStateStrategy({ store })
    const config = makeConfig({ state: strategy })

    const run1 = postWf({ wfid: 'two-pause-form' })
    const r1 = (await run1(() => handleWfOutletRequest(config, deps))) as any
    const t1 = r1.wfs as string
    expect(r1.fields).toEqual(['step-one'])
    expect(typeof t1).toBe('string')

    // Advance step 1 with input → workflow moves to step 2 (still paused).
    // The URL token MUST remain the same so the SPA can survive refresh on step 2.
    const run2 = postWf({ wfs: t1, input: { step: 1 } })
    const r2 = (await run2(() => handleWfOutletRequest(config, deps))) as any
    expect(r2.fields).toEqual(['step-two'])
    expect(r2.wfs).toBe(t1)

    // Refresh on step 2 — same token.
    const run3 = postWf({ wfs: t1 })
    const r3 = (await run3(() => handleWfOutletRequest(config, deps))) as any
    expect(r3.fields).toEqual(['step-two'])
    expect(r3.wfs).toBe(t1)

    // Submit final input → finishes; token is dead after that.
    const run4 = postWf({ wfs: t1, input: { step: 2 } })
    const r4 = await run4(() => handleWfOutletRequest(config, deps))
    expect(r4).toEqual({ finished: true })

    const run5 = postWf({ wfs: t1 })
    const r5 = (await run5(async () => {
      const r = await handleWfOutletRequest(config, deps)
      return { body: r as any, status: useResponse().status }
    })) as any
    expect(r5.status).toBe(410)
  })

  it('unexpected thrown error burns the token; replay is rejected', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const store = createTestStore()
    const strategy = new HandleStateStrategy({ store })
    const config = makeConfig({ state: strategy })

    const run1 = postWf({ wfid: 'throw-flow' })
    const r1 = (await run1(() => handleWfOutletRequest(config, deps))) as any
    const t1 = r1.wfs as string
    expect(typeof t1).toBe('string')

    const run2 = postWf({ wfs: t1, input: { anything: true } })
    await expect(
      run2(() => handleWfOutletRequest(config, deps)),
    ).rejects.toThrow('step exploded')

    const run3 = postWf({ wfs: t1 })
    const r3 = (await run3(async () => {
      const r = await handleWfOutletRequest(config, deps)
      return { body: r as any, status: useResponse().status }
    })) as any
    expect(r3.status).toBe(410)

    expect(await store.get(t1)).toBeNull()
  })
})

describe('createOutletHandler', () => {
  it('creates a handler that wires start/resume', async () => {
    const app = createTestWfApp()
    const handle = createOutletHandler(app as any)
    const config: WfOutletTriggerConfig = {
      state: createTestStrategy(),
      outlets: [createHttpOutlet()],
    }

    const runCtx = postWf({ wfid: 'simple' })

    const result = await runCtx(() => handle(config))
    expect(result).toEqual({ finished: true })
  })
})

describe('integration: full round-trip', () => {
  it('start → pause (HTTP) → resume → finish', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const store = createTestStore()
    const strategy = new HandleStateStrategy({ store })
    const config: WfOutletTriggerConfig = {
      state: strategy,
      outlets: [createHttpOutlet()],
    }

    const run1 = postWf({ wfid: 'with-http-outlet' })
    const r1 = (await run1(() => handleWfOutletRequest(config, deps))) as any
    expect(r1.fields).toEqual(['email', 'password'])
    expect(r1.wfs).toBeDefined()

    const run2 = postWf({ wfs: r1.wfs, input: { email: 'a@b.com' } })
    const r2 = await run2(() => handleWfOutletRequest(config, deps))
    expect(r2).toEqual({ finished: true })
  })

  it('email outlet consumes token (single-use)', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const store = createTestStore()
    const strategy = new HandleStateStrategy({ store })
    const emailSendFn = vi.fn().mockResolvedValue(undefined)
    const config: WfOutletTriggerConfig = {
      state: strategy,
      outlets: [createEmailOutlet(emailSendFn)],
    }

    const run1 = postWf({ wfid: 'with-email-outlet' })
    const r1 = (await run1(() => handleWfOutletRequest(config, deps))) as any
    expect(r1.sent).toBe(true)
    expect(emailSendFn).toHaveBeenCalled()
    const token = emailSendFn.mock.calls[0][0].token

    const run2 = postWf({ wfs: token, input: { email: 'verified@test.com' } })
    const r2 = await run2(() => handleWfOutletRequest(config, deps))
    expect(r2).toEqual({ finished: true })

    const run3 = postWf({ wfs: token })
    const r3 = (await run3(async () => {
      const r = await handleWfOutletRequest(config, deps)
      return { body: r as any, status: useResponse().status }
    })) as any
    expect(r3.status).toBe(410)
    expect(r3.body.error).toBeDefined()
  })

  it('security: admin triggering out-of-band outlet receives no resumption token', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const store = createTestStore()
    const strategy = new HandleStateStrategy({ store })
    const emailSendFn = vi.fn().mockResolvedValue(undefined)
    const config: WfOutletTriggerConfig = {
      state: strategy,
      outlets: [createHttpOutlet(), createEmailOutlet(emailSendFn)],
    }

    const run1 = postWf({ wfid: 'with-email-outlet' })
    const adminResponse = (await run1(() => handleWfOutletRequest(config, deps))) as any

    expect(adminResponse.wfs).toBeUndefined()
    expect(adminResponse).toEqual({ sent: true, outlet: 'email' })

    expect(emailSendFn).toHaveBeenCalledTimes(1)
    const emailedToken = emailSendFn.mock.calls[0][0].token as string
    expect(typeof emailedToken).toBe('string')
    expect(emailedToken.length).toBeGreaterThan(0)

    const run2 = postWf({ wfs: emailedToken, input: { email: 'verified@test.com' } })
    const inviteeResponse = await run2(() => handleWfOutletRequest(config, deps))
    expect(inviteeResponse).toEqual({ finished: true })
  })
})

describe('strategy swap', () => {
  const httpOutlet = createHttpOutlet()

  /**
   * Wraps a HandleStateStrategy to track consume()/persist() calls — so
   * tests can assert which strategy actually handled a given operation.
   */
  function spyStrategy(): {
    strategy: WfStateStrategy
    store: WfStateStoreMemory
    consumeCalls: string[]
    persistCalls: number
  } {
    const store = new WfStateStoreMemory()
    const inner = new HandleStateStrategy({ store })
    const consumeCalls: string[] = []
    let persistCalls = 0
    const strategy: WfStateStrategy = {
      persist: (state, options, overrides) => {
        persistCalls++
        return inner.persist(state, options, overrides)
      },
      retrieve: (token) => inner.retrieve(token),
      consume: (token) => {
        consumeCalls.push(token)
        return inner.consume(token)
      },
    }
    return { strategy, store, consumeCalls, get persistCalls() { return persistCalls } } as any
  }

  it('swap mid-workflow persists with the new strategy', async () => {
    // Step 1 swaps the strategy; step 2 pauses. The next token must carry
    // the new strategy's name and the new strategy's storage must hold the
    // state, not the original.
    const a = spyStrategy()
    const b = spyStrategy()

    const app = createWfApp()
    app.step('switch', { handler: () => { swapStrategy('B') } })
    app.step('pause', {
      handler: () => {
        const { input } = useWfState()
        if (input()) { return }
        return outletHttp({ fields: ['x'] })
      },
    })
    app.flow('swap-then-pause', ['switch', 'pause'])

    const config: WfOutletTriggerConfig = {
      state: { strategies: { A: a.strategy, B: b.strategy }, default: 'A' },
      outlets: [httpOutlet],
    }
    const deps = makeDeps(app)

    const runCtx = postWf({ wfid: 'swap-then-pause' })
    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any

    expect(typeof result.wfs).toBe('string')
    expect(result.wfs.startsWith('B.')).toBe(true)
    const rawHandle = (result.wfs as string).slice(2)
    expect(await b.store.get(rawHandle)).not.toBeNull()
    // A's store stays empty — its strategy was never asked to persist.
    expect(b.persistCalls).toBeGreaterThan(0)
    expect(a.persistCalls).toBe(0)
  })

  it('resume reads strategy from token prefix', async () => {
    // After swap-and-pause, resuming must consume from B (the one that
    // persisted), not A.
    const a = spyStrategy()
    const b = spyStrategy()

    const app = createWfApp()
    app.step('switch', { handler: () => { swapStrategy('B') } })
    app.step('pause', {
      handler: () => {
        const { input } = useWfState()
        if (input()) { return }
        return outletHttp({ fields: ['x'] })
      },
    })
    app.flow('swap-resume', ['switch', 'pause'])

    const config: WfOutletTriggerConfig = {
      state: { strategies: { A: a.strategy, B: b.strategy }, default: 'A' },
      outlets: [httpOutlet],
    }
    const deps = makeDeps(app)

    const r1 = (await postWf({ wfid: 'swap-resume' })(() =>
      handleWfOutletRequest(config, deps),
    )) as any
    const token = r1.wfs as string
    expect(token.startsWith('B.')).toBe(true)

    const r2 = await postWf({ wfs: token, input: { ok: true } })(() =>
      handleWfOutletRequest(config, deps),
    )
    expect(r2).toEqual({ finished: true })
    // Only B saw consume.
    expect(b.consumeCalls.length).toBe(1)
    expect(a.consumeCalls.length).toBe(0)
  })

  it('multiple swaps in one event collapse to the last name', async () => {
    // The strategy at pause time is whatever the final swap set —
    // intermediate swaps have no effect on the token.
    const a = spyStrategy()
    const b = spyStrategy()
    const c = spyStrategy()

    const app = createWfApp()
    app.step('to-b', { handler: () => { swapStrategy('B') } })
    app.step('to-c', { handler: () => { swapStrategy('C') } })
    app.step('pause', {
      handler: () => {
        const { input } = useWfState()
        if (input()) { return }
        return outletHttp({ fields: ['x'] })
      },
    })
    app.flow('two-swaps', ['to-b', 'to-c', 'pause'])

    const config: WfOutletTriggerConfig = {
      state: {
        strategies: { A: a.strategy, B: b.strategy, C: c.strategy },
        default: 'A',
      },
      outlets: [httpOutlet],
    }

    const r = (await postWf({ wfid: 'two-swaps' })(() =>
      handleWfOutletRequest(config, makeDeps(app)),
    )) as any
    expect((r.wfs as string).startsWith('C.')).toBe(true)
    expect(c.persistCalls).toBeGreaterThan(0)
    expect(b.persistCalls).toBe(0)
    expect(a.persistCalls).toBe(0)
  })

  it('swap to unknown name surfaces an error at pause time', async () => {
    // The composable validates only format; the trigger throws loudly when
    // it tries to persist under a name not in its registry. The error must
    // bubble up — silent fallbacks would mask misconfigured swaps.
    const a = spyStrategy()

    const app = createWfApp()
    app.step('bad-swap-then-pause', {
      handler: () => {
        swapStrategy('nonexistent')
        return outletHttp({ fields: ['x'] })
      },
    })
    app.flow('bad-swap-flow', ['bad-swap-then-pause'])

    const config: WfOutletTriggerConfig = {
      state: { strategies: { A: a.strategy }, default: 'A' },
      outlets: [httpOutlet],
    }

    await expect(
      postWf({ wfid: 'bad-swap-flow' })(() =>
        handleWfOutletRequest(config, makeDeps(app)),
      ),
    ).rejects.toThrow(/unknown strategy 'nonexistent'/)
  })

  it('rejects swap to a name that violates the regex inside a step', async () => {
    // Format check is synchronous inside the composable — the step throws
    // immediately, before the engine sees any pause. The trigger never even
    // gets to inspect the inputRequired.
    const a = spyStrategy()

    const app = createWfApp()
    app.step('bad-format', {
      handler: () => {
        swapStrategy('bad.name')
      },
    })
    app.flow('bad-format-flow', ['bad-format'])

    const config: WfOutletTriggerConfig = {
      state: { strategies: { A: a.strategy }, default: 'A' },
      outlets: [httpOutlet],
    }

    await expect(
      postWf({ wfid: 'bad-format-flow' })(() =>
        handleWfOutletRequest(config, makeDeps(app)),
      ),
    ).rejects.toThrow(/invalid name 'bad\.name'/)
  })

  it('unknown prefix on resume returns 410 without leaking which strategies exist', async () => {
    // Generic 410 — never disclose registered strategy names.
    const a = spyStrategy()
    const app = createWfApp()
    app.flow('noop', [])
    const config: WfOutletTriggerConfig = {
      state: { strategies: { A: a.strategy }, default: 'A' },
      outlets: [httpOutlet],
    }

    const r = (await postWf({ wfs: 'evil.somehandle' })(async () => {
      const body = await handleWfOutletRequest(config, makeDeps(app))
      return { body: body as any, status: useResponse().status }
    })) as any
    expect(r.status).toBe(410)
    expect(r.body.error).toBe('Invalid workflow state token')
  })

  it('token without strategy prefix returns 410', async () => {
    // No dot → cannot resolve a strategy → reject before touching storage.
    const a = spyStrategy()
    const app = createWfApp()
    app.flow('noop', [])
    const config: WfOutletTriggerConfig = {
      state: { strategies: { A: a.strategy }, default: 'A' },
      outlets: [httpOutlet],
    }

    const r = (await postWf({ wfs: 'rawtokenwithoutdot' })(async () => {
      const body = await handleWfOutletRequest(config, makeDeps(app))
      return { body: body as any, status: useResponse().status }
    })) as any
    expect(r.status).toBe(410)
    expect(r.body.error).toBe('Invalid workflow state token')
    expect(a.consumeCalls.length).toBe(0)
  })

  it('handle reuse only when strategy name unchanged', async () => {
    // Stable session (no swap) reuses the raw handle → the outer token is
    // stable across pauses. After a swap, a fresh raw handle is minted.
    const a = spyStrategy()
    const b = spyStrategy()

    const app = createWfApp()
    app.step('first-pause', {
      handler: () => {
        const { input } = useWfState()
        if (input()) { return }
        return outletHttp({ fields: ['one'] })
      },
    })
    app.step('switch-then-pause', {
      handler: () => {
        const { input } = useWfState()
        if (input()) { return }
        swapStrategy('B')
        return outletHttp({ fields: ['two'] })
      },
    })
    app.flow('stable-then-swap', ['first-pause', 'switch-then-pause'])

    const config: WfOutletTriggerConfig = {
      state: { strategies: { A: a.strategy, B: b.strategy }, default: 'A' },
      outlets: [httpOutlet],
    }
    const deps = makeDeps(app)

    const r1 = (await postWf({ wfid: 'stable-then-swap' })(() =>
      handleWfOutletRequest(config, deps),
    )) as any
    const t1 = r1.wfs as string
    expect(t1.startsWith('A.')).toBe(true)
    const t1Raw = t1.slice(2)

    // Refresh on first pause — same A.<raw>, raw handle reused.
    const r2 = (await postWf({ wfs: t1 })(() =>
      handleWfOutletRequest(config, deps),
    )) as any
    expect(r2.wfs).toBe(t1)

    // Submit input → advances to second pause which swaps to B.
    const r3 = (await postWf({ wfs: t1, input: { ok: true } })(() =>
      handleWfOutletRequest(config, deps),
    )) as any
    const t3 = r3.wfs as string
    expect(t3.startsWith('B.')).toBe(true)
    // Fresh handle — not the prior raw value.
    expect(t3.slice(2)).not.toBe(t1Raw)
  })

  it('strategy is sticky across resumes without re-swap', async () => {
    // After a swap, the new strategy name travels in the token prefix.
    // Every subsequent resume reads the prefix and re-sets the EventContext,
    // so persist on the *next* pause re-emits the same prefix without the
    // step needing to swap again. This is the cross-event persistence guarantee.
    const a = spyStrategy()
    const b = spyStrategy()

    const app = createWfApp()
    app.step('swap-on-first', {
      handler: () => {
        const { input } = useWfState()
        if (input()) { return }
        swapStrategy('B')
        return outletHttp({ fields: ['first'] })
      },
    })
    app.step('second-pause', {
      handler: () => {
        const { input } = useWfState()
        if (input()) { return }
        // No swap here — relies on the prefix-restored strategy.
        return outletHttp({ fields: ['second'] })
      },
    })
    app.flow('sticky', ['swap-on-first', 'second-pause'])

    const config: WfOutletTriggerConfig = {
      state: { strategies: { A: a.strategy, B: b.strategy }, default: 'A' },
      outlets: [httpOutlet],
    }
    const deps = makeDeps(app)

    // Event 1: start → swap to B → pause-1 → B.<raw1>
    const r1 = (await postWf({ wfid: 'sticky' })(() =>
      handleWfOutletRequest(config, deps),
    )) as any
    const t1 = r1.wfs as string
    expect(t1.startsWith('B.')).toBe(true)

    // Event 2: resume with B.<raw1>, no swap, pause-2 → must still be B-prefixed.
    const r2 = (await postWf({ wfs: t1, input: { ok: true } })(() =>
      handleWfOutletRequest(config, deps),
    )) as any
    const t2 = r2.wfs as string
    expect(t2.startsWith('B.')).toBe(true)
    // B saw both consume calls; A never did after the initial start.
    expect(b.consumeCalls.length).toBe(1)
    expect(a.consumeCalls.length).toBe(0)

    // Event 3: resume with B.<raw2>, finish — still B all the way.
    const r3 = await postWf({ wfs: t2, input: { ok: true } })(() =>
      handleWfOutletRequest(config, deps),
    )
    expect(r3).toEqual({ finished: true })
    expect(b.consumeCalls.length).toBe(2)
    expect(a.consumeCalls.length).toBe(0)
  })

  it('useWfStrategy().current() reports the active name (default and after swap)', async () => {
    // Steps can inspect which strategy is currently active — useful for
    // diagnostic logs / branching.
    const a = spyStrategy()
    const b = spyStrategy()
    const seen: string[] = []

    const app = createWfApp()
    app.step('observe-1', {
      handler: () => { seen.push(useWfStrategy().current() ?? '<none>') },
    })
    app.step('observe-2', {
      handler: () => {
        swapStrategy('B')
        seen.push(useWfStrategy().current() ?? '<none>')
      },
    })
    app.flow('observe', ['observe-1', 'observe-2'])

    const config: WfOutletTriggerConfig = {
      state: { strategies: { A: a.strategy, B: b.strategy }, default: 'A' },
      outlets: [httpOutlet],
    }

    await postWf({ wfid: 'observe' })(() =>
      handleWfOutletRequest(config, makeDeps(app)),
    )
    expect(seen).toEqual(['A', 'B'])
  })

  it('rejects strategy names that violate the regex at trigger time', async () => {
    // Name 'bad.name' would corrupt the token-split contract — reject early.
    const a = spyStrategy()
    const app = createWfApp()
    app.flow('noop', [])
    const config: WfOutletTriggerConfig = {
      state: {
        strategies: { 'bad.name': a.strategy },
        default: 'bad.name',
      },
      outlets: [httpOutlet],
    }
    await expect(
      postWf({ wfid: 'noop' })(() =>
        handleWfOutletRequest(config, makeDeps(app)),
      ),
    ).rejects.toThrow(/Invalid strategy name/)
  })
})
