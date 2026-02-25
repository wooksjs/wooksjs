```ts
import { createCliApp, useCliOption, useRouteParams } from '@wooksjs/event-cli'

const app = createCliApp()

app.cli('deploy :env', () => {
  const { get } = useRouteParams<{ env: string }>()
  const verbose = useCliOption('verbose')
  return `Deploying to ${get('env')}...`
})

app.run()
```
