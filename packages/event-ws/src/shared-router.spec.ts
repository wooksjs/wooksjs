import type { TConsoleBase } from '@prostojs/logger'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGlobalWooks, getGlobalWooks } from 'wooks'

import { createWsApp } from './ws-adapter'

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

describe('WS apps on the shared global router', () => {
  it('warns a standalone app whose route an app built from another app registered first', () => {
    const logger = makeLogger()
    // `createWsApp(httpApp)` in an app; here the app it is built from is another WS app
    const built = createWsApp(createWsApp(), { logger })
    const standalone = createWsApp({ logger })
    built.onMessage('message', '/chat/:room', () => 'built')
    standalone.onMessage('message', '/chat/:room', () => 'standalone')

    expect(logger.warn).toHaveBeenCalledOnce()
    expect(logger.warn.mock.calls[0][0]).toContain('"message /chat/:room" is already registered')
  })

  it('warns a standalone app whose route an app given the global Wooks registered first', () => {
    const logger = makeLogger()
    const explicit = createWsApp(getGlobalWooks(), { logger })
    const standalone = createWsApp({ logger })
    explicit.onMessage('message', '/chat', () => 'explicit')
    standalone.onMessage('message', '/chat', () => 'standalone')

    expect(logger.warn).toHaveBeenCalledOnce()
  })
})
