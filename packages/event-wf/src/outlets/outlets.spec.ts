import { EventContext, run } from '@wooksjs/event-core'
import { prepareTestHttpContext, useResponse } from '@wooksjs/event-http'
import { HandleStateStrategy, WfStateStoreMemory, outlet, outletEmail, outletHttp } from '@prostojs/wf/outlets'
import type { WfOutlet, WfStateStrategy } from '@prostojs/wf/outlets'
import { describe, expect, it, vi } from 'vitest'

import { createWfApp } from '../wf-adapter'
import { useWfState } from '../composables'

import { createEmailOutlet, createHttpOutlet } from './create-outlet'
import { createOutletHandler } from './create-handler'
import { outletsRegistryKey, stateStrategyKey, wfFinishedKey } from './outlet-context'
import { handleWfOutletRequest } from './trigger'
import type { WfOutletTriggerConfig, WfOutletTriggerDeps } from './types'
import { useWfFinished } from './use-wf-finished'
import { useWfOutlet } from './use-wf-outlet'

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

  app.flow('simple', ['complete'])
  app.flow('with-http-outlet', ['ask-input', 'use-input'])
  app.flow('with-email-outlet', ['send-email', 'use-input'])
  app.flow('redirect-flow', ['complete', 'finish-redirect'])
  app.flow('data-flow', ['complete', 'finish-data'])
  app.flow('retry-flow', ['validate-retry'])
  app.flow('throw-flow', ['throws-on-input'])

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

  it('getStateStrategy returns active strategy', () => {
    const ctx = new EventContext({ logger: console as any })
    const strategy = createTestStrategy()
    ctx.set(stateStrategyKey, strategy)

    run(ctx, () => {
      expect(useWfOutlet().getStateStrategy()).toBe(strategy)
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

  it('returns 400 for expired/invalid token', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig()

    const runCtx = postWf({ wfs: 'invalid-token' })

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
    expect(result.error).toBeDefined()
    expect(result.status).toBe(400)
  })

  it('returns 403 for disallowed wfid', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig({ allow: ['other-flow'] })

    const runCtx = postWf({ wfid: 'simple' })

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
    expect(result.status).toBe(403)
  })

  it('returns 403 for blocked wfid', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig({ block: ['simple'] })

    const runCtx = postWf({ wfid: 'simple' })

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
    expect(result.status).toBe(403)
  })

  it('returns 400 when missing both wfs and wfid', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig()

    const runCtx = postWf({})

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
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

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
    expect(result.status).toBe(500)
    expect(result.error).toContain('nonexistent')
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
    const r2 = (await runCtx3(() => handleWfOutletRequest(config, deps))) as any
    expect(r2.status).toBe(400)
    expect(r2.error).toBeDefined()
  })

  it('retriable pause: old token is single-use; new token returned for retry', async () => {
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
    const t2 = r2.wfs as string
    expect(typeof t2).toBe('string')
    expect(t2).not.toBe(t1)

    const run3 = postWf({ wfs: t1, input: { password: 'good' } })
    const r3 = (await run3(() => handleWfOutletRequest(config, deps))) as any
    expect(r3.status).toBe(400)

    const run4 = postWf({ wfs: t2, input: { password: 'good' } })
    const r4 = await run4(() => handleWfOutletRequest(config, deps))
    expect(r4).toEqual({ finished: true })
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
    const r3 = (await run3(() => handleWfOutletRequest(config, deps))) as any
    expect(r3.status).toBe(400)

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
    const r3 = (await run3(() => handleWfOutletRequest(config, deps))) as any
    expect(r3.status).toBe(400)
    expect(r3.error).toBeDefined()
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
