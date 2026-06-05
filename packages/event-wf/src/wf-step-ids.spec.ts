import type { TConsoleBase } from '@prostojs/logger'
import { clearGlobalWooks } from 'wooks'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createWfApp } from './wf-adapter'

function makeLogger() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  } satisfies TConsoleBase
}

describe('event-wf duplicate step ids', () => {
  // The router is a process-global singleton when no Wooks is passed, so step
  // ids live on a shared router across adapter instances. Reset it before each
  // test to keep them hermetic.
  beforeEach(() => clearGlobalWooks())

  it('warns on a duplicate WF_STEP id and keeps the first registration', async () => {
    const logger = makeLogger()
    const app = createWfApp<{ result?: number }>({ logger })

    app.step('dup', { handler: 'ctx.result = 1' })
    expect(logger.warn).not.toHaveBeenCalled()

    app.step('dup', { handler: 'ctx.result = 2' })
    expect(logger.warn).toHaveBeenCalledOnce()
    expect(logger.warn.mock.calls[0][0]).toContain('registered more than once')

    // First registration wins — the duplicate handler is never reached.
    app.flow('dup-flow', ['dup'])
    const result = await app.start('dup-flow', { result: 0 })
    expect(result.state.context.result).toBe(1)
  })

  it('throws on a duplicate WF_STEP id when strictStepIds is enabled', () => {
    const app = createWfApp<{ result?: number }>({ strictStepIds: true })

    app.step('strict', { handler: 'ctx.result = 1' })
    expect(() => app.step('strict', { handler: 'ctx.result = 2' })).toThrow(
      /already registered/u,
    )
  })

  it('does not warn after clearGlobalWooks resets the shared router (HMR-safe)', () => {
    const logger = makeLogger()

    const app1 = createWfApp<{ x?: number }>({ logger })
    app1.step('hmr', { handler: 'ctx.x = 1' })

    // Simulate a dev-restart cleanup that resets the shared router.
    clearGlobalWooks()

    const app2 = createWfApp<{ x?: number }>({ logger })
    app2.step('hmr', { handler: 'ctx.x = 2' })

    expect(logger.warn).not.toHaveBeenCalled()
  })
})
