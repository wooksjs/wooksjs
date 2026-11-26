import type { TConsoleBase } from '@prostojs/logger'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGlobalWooks, getGlobalWooks } from 'wooks'

import { createCliApp } from './cli-adapter'

function makeLogger() {
  return {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  } satisfies TConsoleBase
}

beforeEach(() => {
  clearGlobalWooks()
})

describe('CLI apps on the shared global router', () => {
  it('warns an app whose command an app built from another app registered first', () => {
    const logger = makeLogger()
    // `createCliApp({}, httpApp)` in an app; here the app it is built from is another CLI app
    const built = createCliApp({ logger }, createCliApp())
    const second = createCliApp({ logger })
    built.cli('start', () => 'built')
    second.cli('start', () => 'second')

    expect(logger.warn).toHaveBeenCalledOnce()
    expect(logger.warn.mock.calls[0][0]).toContain('"CLI /start" is already registered')
  })

  it('warns an app whose command an app given the global Wooks registered first', () => {
    const logger = makeLogger()
    const explicit = createCliApp({ logger }, getGlobalWooks())
    const second = createCliApp({ logger })
    explicit.cli('start', () => 'explicit')
    second.cli('start', () => 'second')

    expect(logger.warn).toHaveBeenCalledOnce()
  })

  it('stays silent for an app built from the app that registered the command', () => {
    const logger = makeLogger()
    const app = createCliApp({ logger })
    app.cli('start', () => 'app')
    createCliApp({ logger }, app).cli('start', () => 'built from app')

    expect(logger.warn).not.toHaveBeenCalled()
  })
})
