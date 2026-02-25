import { describe, it, expect } from 'vitest'
import { slot, defineEventKind, key, cached, EventContext } from '../index'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

describe('defineEventKind', () => {
  it('creates keys for each slot in the schema', () => {
    const http = defineEventKind('http', {
      method: slot<string>(),
      path: slot<string>(),
    })

    expect(http.name).toBe('http')
    expect(http.keys.method._name).toBe('http.method')
    expect(http.keys.path._name).toBe('http.path')
    expect(http.keys.method._id).not.toBe(http.keys.path._id)
  })

  it('seed populates a context with typed values', () => {
    const http = defineEventKind('http', {
      method: slot<string>(),
      path: slot<string>(),
    })

    const ctx = new EventContext({ logger })
    ctx.seed(http, { method: 'GET', path: '/users' })

    expect(ctx.get(http.keys.method)).toBe('GET')
    expect(ctx.get(http.keys.path)).toBe('/users')
  })

  it('child context reads parent kind via parent chain', () => {
    const http = defineEventKind('http', {
      method: slot<string>(),
    })
    const workflow = defineEventKind('wf', {
      triggerId: slot<string>(),
    })

    const httpCtx = new EventContext({ logger })
    httpCtx.seed(http, { method: 'POST' })

    const wfCtx = new EventContext({ logger, parent: httpCtx })
    wfCtx.seed(workflow, { triggerId: 'wf-001' })

    expect(wfCtx.get(http.keys.method)).toBe('POST')
    expect(wfCtx.get(workflow.keys.triggerId)).toBe('wf-001')
  })

  it('cached values can depend on keys from parent context', () => {
    const http = defineEventKind('http', {
      method: slot<string>(),
    })
    const workflow = defineEventKind('wf', {
      triggerId: slot<string>(),
    })
    const summary = cached(
      (ctx) => `${ctx.get(http.keys.method)} → ${ctx.get(workflow.keys.triggerId)}`,
    )

    const httpCtx = new EventContext({ logger })
    httpCtx.seed(http, { method: 'POST' })

    const wfCtx = new EventContext({ logger, parent: httpCtx })
    wfCtx.seed(workflow, { triggerId: 'deploy-123' })

    expect(wfCtx.get(summary)).toBe('POST → deploy-123')
  })
})
