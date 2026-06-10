import { StepRetriableError } from '@prostojs/wf'
import { useRouteParams } from '@wooksjs/event-core'
import { describe, expect, it } from 'vitest'

import { useWfState } from './composables'
import { createWfApp } from './wf-adapter'

const app = createWfApp<{ result?: number }>()

app.step('add', {
  input: 'number',
  handler: 'ctx.result += input',
})

app.step('add/:n', {
  handler: () => {
    const { ctx } = useWfState()
    ctx<{ result: number }>().result += Number(useRouteParams().get('n'))
  },
})

app.flow('adding', [
  { id: 'add', input: 5 },
  { id: 'add', input: 2 },
  {
    condition: 'result < 10',
    steps: [
      { id: 'add', input: 3 },
      { id: 'add', input: 4 },
    ],
  },
])

app.flow('adding-parametric', [
  'add/5',
  'add/2',
  {
    condition: 'result < 10',
    steps: ['add/3', 'add/4'],
  },
])
app.flow('parametric/*', [
  'add/5',
  'add/2',
  {
    condition: 'result < 10',
    steps: ['add/3', 'add/4'],
  },
])

let c = -100

app.flow('init', ['add/1'], '', () => {
  const ctx = useWfState().ctx<{ result: number }>()
  c = ctx.result
  ctx.result = 0
})

describe('event-wf', () => {
  it('must run simple wf', async () => {
    const result = await app.start('adding', { result: 0 })
    console.log(result)
    expect(result.state.context.result).toBe(14)
    const result2 = await app.start('adding', { result: 10 })
    expect(result2.state.context.result).toBe(17)
  })
  it('must run wf with parametric steps', async () => {
    const result = await app.start('adding-parametric', { result: 0 })
    expect(result.state.context.result).toBe(14)
    const result2 = await app.start('adding-parametric', { result: 10 })
    expect(result2.state.context.result).toBe(17)
  })
  it('must run parametric wf with parametric steps', async () => {
    const result = await app.start('parametric/abc', { result: 0 })
    expect(result.state.context.result).toBe(14)
    const result2 = await app.start('parametric/asdf/asdf12', { result: 10 })
    expect(result2.state.context.result).toBe(17)
  })
  it('must call init fn', async () => {
    const result = await app.start('init', {})
    expect(c).toBeUndefined()
    expect(result.state.context.result).toBe(1)
  })
})

app.step('ask-value', {
  input: 'value',
  handler: () => {
    const { ctx, input } = useWfState()
    ctx<{ result: number }>().result = Number(input() ?? 0)
  },
})

app.flow('pausing', ['ask-value', 'add/2'])

let failOnce = true

app.step('flaky', {
  handler: () => {
    const { ctx } = useWfState()
    if (failOnce) {
      failOnce = false
      throw new StepRetriableError(new Error('transient'))
    }
    ctx<{ result: number }>().result += 1
  },
})

app.flow('flaky-flow', ['add/1', 'flaky'])

describe('event-wf pause and retry', () => {
  it('must pause and resume without a strategy run option', async () => {
    const out = await app.start('pausing', {})
    expect(out.finished).toBe(false)
    expect(out.inputRequired).toBeDefined()
    const out2 = await out.resume!(7)
    expect(out2.finished).toBe(true)
    expect(out2.state.context.result).toBe(9)
  })
  it('must retry a retriable error via output.retry() in steps using composables', async () => {
    const out = await app.start('flaky-flow', { result: 0 })
    expect(out.finished).toBe(false)
    expect(out.error).toBeDefined()
    expect(out.retry).toBeDefined()
    const out2 = await out.retry!()
    expect(out2.finished).toBe(true)
    expect(out2.state.context.result).toBe(2)
  })
})
