```ts
import { createWfApp, useWfState } from '@wooksjs/event-wf'

const app = createWfApp<{ approved: boolean }>()

app.step('validate', { handler: () => { /* ... */ } })
app.step('notify-success', { handler: () => { /* ... */ } })
app.step('notify-rejection', { handler: () => { /* ... */ } })

app.step('review', {
  input: 'approval',
  handler: () => {
    const { ctx, input } = useWfState()
    ctx<{ approved: boolean }>().approved = input<boolean>() ?? false
  },
})

app.flow('approval-process', [
  'validate', 'review',
  { condition: 'approved', steps: ['notify-success'] },
  { condition: '!approved', steps: ['notify-rejection'] },
])
```
