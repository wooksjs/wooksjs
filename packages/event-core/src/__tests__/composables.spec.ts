import { describe, it, expect } from 'vitest'
import {
  useRouteParams,
  useEventId,
  createEventContext,
  current,
  EventContext,
  run,
  routeParamsKey,
} from '../index'
import type { Logger } from '../index'

const logger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

describe('useRouteParams', () => {
  it('reads route params from context', () => {
    createEventContext({ logger }, () => {
      current().set(routeParamsKey, { id: '42', name: 'alice' })
      const { params, get } = useRouteParams()
      expect(params).toEqual({ id: '42', name: 'alice' })
      expect(get('id')).toBe('42')
      expect(get('name')).toBe('alice')
    })
  })

  it('accepts explicit ctx parameter', () => {
    const ctx = new EventContext({ logger })
    ctx.set(routeParamsKey, { foo: 'bar' })
    run(ctx, () => {
      const { params } = useRouteParams(ctx)
      expect(params).toEqual({ foo: 'bar' })
    })
  })

  it('works with typed params', () => {
    createEventContext({ logger }, () => {
      current().set(routeParamsKey, { userId: '123' })
      const { get } = useRouteParams<{ userId: string }>()
      expect(get('userId')).toBe('123')
    })
  })
})

describe('useEventId', () => {
  it('returns a UUID via getId()', () => {
    createEventContext({ logger }, () => {
      const { getId } = useEventId()
      const id = getId()
      expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/)
    })
  })

  it('returns the same ID on subsequent calls within same context', () => {
    createEventContext({ logger }, () => {
      const { getId } = useEventId()
      const id1 = getId()
      const id2 = getId()
      expect(id1).toBe(id2)
    })
  })

  it('returns different IDs for different contexts', () => {
    let id1: string | undefined
    let id2: string | undefined

    createEventContext({ logger }, () => {
      id1 = useEventId().getId()
    })
    createEventContext({ logger }, () => {
      id2 = useEventId().getId()
    })

    expect(id1).toBeDefined()
    expect(id2).toBeDefined()
    expect(id1).not.toBe(id2)
  })

  it('accepts explicit ctx parameter', () => {
    createEventContext({ logger }, () => {
      const ctx = current()
      const { getId } = useEventId(ctx)
      const id = getId()
      expect(id).toMatch(/^[\da-f]{8}-/)
    })
  })
})
