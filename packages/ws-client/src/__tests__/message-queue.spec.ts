import { describe, expect, it } from 'vitest'

import { MessageQueue } from '../message-queue'

describe('MessageQueue', () => {
  it('must enqueue and flush messages in order', () => {
    const q = new MessageQueue()
    q.enqueue('a')
    q.enqueue('b')
    q.enqueue('c')
    expect(q.size).toBe(3)

    const sent: string[] = []
    const count = q.flush((data) => sent.push(data))

    expect(count).toBe(3)
    expect(sent).toEqual(['a', 'b', 'c'])
    expect(q.size).toBe(0)
  })

  it('must clear all messages', () => {
    const q = new MessageQueue()
    q.enqueue('a')
    q.enqueue('b')
    q.clear()
    expect(q.size).toBe(0)

    const sent: string[] = []
    q.flush((data) => sent.push(data))
    expect(sent).toEqual([])
  })

  it('must flush empty queue without error', () => {
    const q = new MessageQueue()
    const count = q.flush(() => {})
    expect(count).toBe(0)
  })
})
