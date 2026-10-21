import { describe, expect, it, vi } from 'vitest'

import { EventContext, run, useLocale } from '../index'

/*
 * useLocale() contract (kind-agnostic):
 *  - `get()` returns the nearest locale set on this context or an ancestor, else `undefined`;
 *  - `set(value)` sets it on THIS context only (children inherit it, the parent never sees it);
 *  - `set(fn)` installs a lazy resolver: it runs on the first `get()` that reaches it — once,
 *    then the value is kept on the context it was set on (shared by every child);
 *  - a resolver that throws is retried on the next `get()`; a resolver that reads the locale
 *    itself sees `undefined` instead of recursing.
 */

const logger = console as never
const ctxOf = (parent?: EventContext) => new EventContext({ logger, parent })

describe('useLocale', () => {
  it('is undefined until set', () => {
    expect(useLocale(ctxOf()).get()).toBeUndefined()
  })

  it('set/get on one context, defaulting to current()', () => {
    const ctx = ctxOf()
    run(ctx, () => {
      useLocale().set('de')
      expect(useLocale().get()).toBe('de')
    })
    expect(useLocale(ctx).get()).toBe('de')
  })

  it('children inherit; a child override never reaches the parent', () => {
    const parent = ctxOf()
    useLocale(parent).set('fr')
    const child = ctxOf(parent)
    const sibling = ctxOf(parent)
    expect(useLocale(child).get()).toBe('fr')
    useLocale(child).set('ru')
    expect(useLocale(child).get()).toBe('ru')
    expect(useLocale(parent).get()).toBe('fr')
    expect(useLocale(sibling).get()).toBe('fr')
    useLocale(child).set(undefined)
    expect(useLocale(child).get()).toBeUndefined()
  })

  it('a resolver is lazy, runs once, and its value is shared with children', () => {
    const resolve = vi.fn(() => 'pt-BR')
    const parent = ctxOf()
    useLocale(parent).set(resolve)
    expect(resolve).not.toHaveBeenCalled()
    const child = ctxOf(parent)
    expect(useLocale(child).get()).toBe('pt-BR')
    expect(useLocale(parent).get()).toBe('pt-BR')
    expect(useLocale(ctxOf(parent)).get()).toBe('pt-BR')
    expect(resolve).toHaveBeenCalledOnce()
  })

  it('a throwing resolver propagates and is retried next time', () => {
    let fail = true
    const ctx = ctxOf()
    useLocale(ctx).set(() => {
      if (fail) {
        throw new Error('catalog not ready')
      }
      return 'en'
    })
    expect(() => useLocale(ctx).get()).toThrow('catalog not ready')
    fail = false
    expect(useLocale(ctx).get()).toBe('en')
  })

  it('a resolver reading the locale itself gets undefined (no recursion)', () => {
    const ctx = ctxOf()
    useLocale(ctx).set(() => useLocale(ctx).get() ?? 'fallback')
    expect(useLocale(ctx).get()).toBe('fallback')
  })

  it('a resolver may return undefined (no locale)', () => {
    const ctx = ctxOf()
    const resolve = vi.fn(() => undefined)
    useLocale(ctx).set(resolve)
    expect(useLocale(ctx).get()).toBeUndefined()
    expect(useLocale(ctx).get()).toBeUndefined()
    expect(resolve).toHaveBeenCalledOnce()
  })
})
