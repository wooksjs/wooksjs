import { describe, it, expect, vi, afterEach } from 'vitest'
import { registerCoreCopy } from '../storage'
import { key, cached } from '../key'

const STORAGE_KEY = Symbol.for('wooks.core.asyncStorage')
const VERSION_KEY = Symbol.for('wooks.core.asyncStorage.version')
const PATH_KEY = Symbol.for('wooks.core.asyncStorage.path')
const COUNTER_KEY = Symbol.for('wooks.core.keyCounter')

type Holder = Record<symbol, unknown>

describe('duplicate copy detection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stamps the real globalThis at import time', () => {
    const g = globalThis as unknown as Holder
    expect(g[STORAGE_KEY]).toBeDefined()
    expect(typeof g[VERSION_KEY]).toBe('string')
    expect(g[PATH_KEY]).toContain('storage')
  })

  it('does not warn on the first copy and stamps version + path', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fakeGlobal: Holder = {}

    const storage = registerCoreCopy({ version: '1.0.0', path: '/first/index.mjs' }, fakeGlobal)

    expect(warn).not.toHaveBeenCalled()
    expect(fakeGlobal[STORAGE_KEY]).toBe(storage)
    expect(fakeGlobal[VERSION_KEY]).toBe('1.0.0')
    expect(fakeGlobal[PATH_KEY]).toBe('/first/index.mjs')
  })

  it('warns once on a same-version second copy and keeps the first stamp', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fakeGlobal: Holder = {}

    const first = registerCoreCopy({ version: '1.0.0', path: '/first/index.mjs' }, fakeGlobal)
    const second = registerCoreCopy({ version: '1.0.0', path: '/second/index.cjs' }, fakeGlobal)

    expect(warn).toHaveBeenCalledTimes(1)
    const message = warn.mock.calls[0][0] as string
    expect(message).toContain('[wooks] A second copy of @wooksjs/event-core v1.0.0 was loaded')
    expect(message).toContain('first: /first/index.mjs')
    expect(message).toContain('now: /second/index.cjs')
    expect(message).toContain('Cannot read properties of undefined')
    expect(message).toContain('bundle it entirely or keep it entirely external')

    // the storage is shared, the first stamp wins
    expect(second).toBe(first)
    expect(fakeGlobal[PATH_KEY]).toBe('/first/index.mjs')
    expect(fakeGlobal[VERSION_KEY]).toBe('1.0.0')
  })

  it('throws on a version mismatch', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fakeGlobal: Holder = {}

    registerCoreCopy({ version: '0.7.22', path: '/first/index.mjs' }, fakeGlobal)

    expect(() => registerCoreCopy({ version: '0.8.0', path: '/second' }, fakeGlobal)).toThrow(
      '[wooks] Incompatible versions of @wooksjs/event-core detected: ' +
        'existing v0.7.22, loading v0.8.0. ' +
        'All packages must use the same @wooksjs/event-core version.',
    )
    expect(warn).not.toHaveBeenCalled()
  })

  it('describes unknown paths gracefully', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fakeGlobal: Holder = {}

    registerCoreCopy({ version: '1.0.0' }, fakeGlobal)
    registerCoreCopy({ version: '1.0.0' }, fakeGlobal)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0] as string).toContain('(first: unknown path, now: unknown path)')
  })
})

describe('shared slot-id counter', () => {
  it('mints ids from the global counter object', () => {
    const counter = (globalThis as unknown as Holder)[COUNTER_KEY] as { next: number }
    expect(counter).toBeDefined()

    const before = counter.next
    const k = key<string>('some-key')
    expect(k._id).toBe(before)
    expect(counter.next).toBe(before + 1)

    const c = cached(() => 1)
    expect(c._id).toBe(before + 1)
    expect(c._name).toBe(`cached:${before + 1}`)
    expect(counter.next).toBe(before + 2)
  })

  it('continues from a counter advanced by another copy', () => {
    const counter = (globalThis as unknown as Holder)[COUNTER_KEY] as { next: number }

    // simulate a second copy of event-core that minted its own slots:
    // it shares this counter, so our next id must continue after it
    counter.next += 1000
    const expected = counter.next

    expect(key<string>('after-second-copy')._id).toBe(expected)
    expect(cached(() => 1)._id).toBe(expected + 1)
  })
})
