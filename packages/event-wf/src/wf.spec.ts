import { useRouteParams } from '@wooksjs/event-core'
import { createWfApp } from './wf-adapter'
import { useWfState } from './composables'

const app = createWfApp<{ result: number }>()

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
        steps: [{ id: 'add', input: 3 }, { id: 'add', input: 4 }],
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

describe('event-wf', () => {
    it('must run simple wf', async () => {
        const result = await app.start('adding', { result: 0 })
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
})
