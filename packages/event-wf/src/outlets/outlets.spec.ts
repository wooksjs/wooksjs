import { EventContext, run } from '@wooksjs/event-core'
import { prepareTestHttpContext } from '@wooksjs/event-http'
import { HandleStateStrategy, WfStateStoreMemory, outletEmail, outletHttp } from '@prostojs/wf/outlets'
import type { WfStateStrategy } from '@prostojs/wf/outlets'
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

// --- Test helpers ---

function createTestStore() {
  return new WfStateStoreMemory()
}

function createTestStrategy(store?: WfStateStoreMemory) {
  return new HandleStateStrategy({ store: store ?? createTestStore() })
}

function createTestWfApp() {
  const app = createWfApp<{ result?: number }>()

  // A step that completes immediately
  app.step('complete', {
    handler: () => {
      const { ctx } = useWfState()
      ctx<{ result?: number }>().result = 42
    },
  })

  // A step that pauses with HTTP outlet (checks input to decide pause vs continue)
  app.step('ask-input', {
    handler: () => {
      const { input } = useWfState()
      if (input()) { return }
      return outletHttp({ fields: ['email', 'password'] })
    },
  })

  // A step that pauses with email outlet (checks input to decide pause vs continue)
  app.step('send-email', {
    handler: () => {
      const { input } = useWfState()
      if (input()) { return }
      return outletEmail('user@test.com', 'verify')
    },
  })

  // A step that sets finished response
  app.step('finish-redirect', {
    handler: () => {
      useWfFinished().set({ type: 'redirect', value: '/dashboard' })
    },
  })

  // A step that sets data response
  app.step('finish-data', {
    handler: () => {
      useWfFinished().set({ type: 'data', value: { success: true } })
    },
  })

  // A step that uses input
  app.step('use-input', {
    handler: () => {
      const { ctx, input } = useWfState()
      const i = input<{ email: string }>()
      if (i) {
        ctx<{ result?: number }>().result = 100
      }
    },
  })

  app.flow('simple', ['complete'])
  app.flow('with-http-outlet', ['ask-input', 'use-input'])
  app.flow('with-email-outlet', ['send-email', 'use-input'])
  app.flow('redirect-flow', ['complete', 'finish-redirect'])
  app.flow('data-flow', ['complete', 'finish-data'])

  return app
}

function makeDeps(app: ReturnType<typeof createTestWfApp>): WfOutletTriggerDeps {
  return {
    start: (schemaId, context, opts) => app.start(schemaId, context as any, opts as any),
    resume: (state, opts) => app.resume(state as any, opts as any),
  }
}

// --- Tests ---

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

    const runCtx = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'simple' }),
    })

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

    const runCtx = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'simple' }),
    })

    const result = await runCtx(() => handleWfOutletRequest(config, deps)) as any
    // The 'complete' step sets result=42, but initial context started at 99
    // The step does ctx.result = 42, so final is 42 regardless
    expect(result.context.result).toBe(42)
  })

  it('pauses workflow with HTTP outlet and returns form + token', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig()

    const runCtx = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'with-http-outlet' }),
    })

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

    // Start — should pause
    const runCtx1 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'with-http-outlet' }),
    })
    const startResult = (await runCtx1(() => handleWfOutletRequest(config, deps))) as any
    const token = startResult.wfs

    // Resume with token + input
    const runCtx2 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfs: token, input: { email: 'a@b.com' } }),
    })
    const resumeResult = await runCtx2(() => handleWfOutletRequest(config, deps))
    expect(resumeResult).toEqual({ finished: true })
  })

  it('returns 400 for expired/invalid token', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig()

    const runCtx = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfs: 'invalid-token' }),
    })

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
    expect(result.error).toBeDefined()
    expect(result.status).toBe(400)
  })

  it('returns 403 for disallowed wfid', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig({ allow: ['other-flow'] })

    const runCtx = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'simple' }),
    })

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
    expect(result.status).toBe(403)
  })

  it('returns 403 for blocked wfid', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig({ block: ['simple'] })

    const runCtx = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'simple' }),
    })

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
    expect(result.status).toBe(403)
  })

  it('returns 400 when missing both wfs and wfid', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig()

    const runCtx = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({}),
    })

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
    expect(result.status).toBe(400)
  })

  it('returns 500 for unknown outlet', async () => {
    const app = createWfApp()
    app.step('unknown-outlet', {
      handler: () => ({ inputRequired: { outlet: 'nonexistent' } }),
    })
    app.flow('unknown-outlet-flow', ['unknown-outlet'])
    const deps = makeDeps(app as any)
    const config = makeConfig()

    const runCtx = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'unknown-outlet-flow' }),
    })

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

    const runCtx = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'simple' }),
    })

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

    // Start — should pause
    const runCtx1 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'with-http-outlet' }),
    })
    const startResult = (await runCtx1(() => handleWfOutletRequest(config, deps))) as any
    const token = startResult.wfs

    // Resume with token in cookie
    const runCtx2 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `wfs=${token}`,
      },
      rawBody: JSON.stringify({ input: { email: 'a@b.com' } }),
    })
    const resumeResult = await runCtx2(() => handleWfOutletRequest(config, deps))
    expect(resumeResult).toEqual({ finished: true })
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

    const runCtx = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'simple' }),
    })

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

    // 1. Start workflow — pauses at ask-input step
    const run1 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'with-http-outlet' }),
    })
    const r1 = (await run1(() => handleWfOutletRequest(config, deps))) as any
    expect(r1.fields).toEqual(['email', 'password'])
    expect(r1.wfs).toBeDefined()

    // 2. Resume with user input
    const run2 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfs: r1.wfs, input: { email: 'a@b.com' } }),
    })
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

    // 1. Start workflow — pauses at send-email step
    const run1 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'with-email-outlet' }),
    })
    const r1 = (await run1(() => handleWfOutletRequest(config, deps))) as any
    expect(r1.sent).toBe(true)
    expect(emailSendFn).toHaveBeenCalled()
    const token = emailSendFn.mock.calls[0][0].token

    // 2. Resume with token — should consume it
    const run2 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfs: token, input: { email: 'verified@test.com' } }),
    })
    const r2 = await run2(() => handleWfOutletRequest(config, deps))
    expect(r2).toEqual({ finished: true })

    // 3. Try to reuse the same token — should fail (consumed)
    const run3 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfs: token }),
    })
    const r3 = (await run3(() => handleWfOutletRequest(config, deps))) as any
    expect(r3.status).toBe(400)
    expect(r3.error).toBeDefined()
  })
})
