```ts
import { createWfApp, useWfState } from '@wooksjs/event-wf'

const app = createWfApp<{ approved: boolean }>()

app.step('review', {
  input: 'approval',
  handler: () => {
    const { ctx, input } = useWfState<{ approved: boolean }>()
    ctx().approved = input<boolean>() ?? false
  },
})

app.flow('approval-process', [
  'validate', 'review',
  { condition: 'approved', steps: ['notify-success'] },
  { condition: '!approved', steps: ['notify-rejection'] },
])
```
