import { describe, expect, it, vi } from 'vitest'

import { useRouteParams } from '../composables/route-params'
import { useEventId } from '../composables/event-id'
import { useEventLogger } from '../composables/event-logger'
import { createAsyncEventContext } from '../context'

function runInTestContext<T>(cb: () => T): T {
  const run = createAsyncEventContext({
    event: { type: 'TEST' },
    options: {},
  })
  return run(cb)
}

describe('useRouteParams', () => {
  it('must return empty object when no route params set', () => {
    runInTestContext(() => {
      const { params } = useRouteParams()
      expect(params).toEqual({})
    })
  })

  it('must return route params from context', () => {
    const run = createAsyncEventContext({
      event: { type: 'TEST' },
      options: {},
      routeParams: { id: '123', name: 'test' },
    })
    run(() => {
      const { params, get } = useRouteParams<{ id: string; name: string }>()
      expect(params).toEqual({ id: '123', name: 'test' })
      expect(get('id')).toBe('123')
      expect(get('name')).toBe('test')
    })
  })

  it('must handle array route params', () => {
    const run = createAsyncEventContext({
      event: { type: 'TEST' },
      options: {},
      routeParams: { tags: ['a', 'b'] },
    })
    run(() => {
      const { get } = useRouteParams<{ tags: string[] }>()
      expect(get('tags')).toEqual(['a', 'b'])
    })
  })
})

describe('useEventId', () => {
  it('must generate a UUID on first call', () => {
    runInTestContext(() => {
      const { getId } = useEventId()
      const id = getId()
      expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/)
    })
  })

  it('must return the same ID on subsequent calls', () => {
    runInTestContext(() => {
      const { getId } = useEventId()
      const first = getId()
      const second = getId()
      expect(first).toBe(second)
    })
  })

  it('must generate unique IDs for different contexts', () => {
    let id1 = ''
    let id2 = ''

    const run1 = createAsyncEventContext({ event: { type: 'TEST' }, options: {} })
    run1(() => { id1 = useEventId().getId() })

    const run2 = createAsyncEventContext({ event: { type: 'TEST' }, options: {} })
    run2(() => { id2 = useEventId().getId() })

    expect(id1).not.toBe(id2)
  })
})

describe('useEventLogger', () => {
  it('must return a logger with standard log methods', () => {
    runInTestContext(() => {
      const logger = useEventLogger()
      expect(logger.log).toBeTypeOf('function')
      expect(logger.warn).toBeTypeOf('function')
      expect(logger.error).toBeTypeOf('function')
    })
  })

  it('must return the same logger instance within a context', () => {
    runInTestContext(() => {
      const logger1 = useEventLogger()
      const logger2 = useEventLogger()
      expect(logger1).toBe(logger2)
    })
  })

  it('must return a topic-scoped sub-logger when topic is provided', () => {
    runInTestContext(() => {
      const logger = useEventLogger('my-topic')
      expect(logger).toBeDefined()
      expect(logger.log).toBeTypeOf('function')
    })
  })
})
