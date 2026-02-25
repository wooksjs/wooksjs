```ts
import { createHttpApp, useRouteParams } from '@wooksjs/event-http'
import { useBody } from '@wooksjs/http-body'

const app = createHttpApp()

app.post('/users/:org', async () => {
  const { parseBody } = useBody()
  const { get } = useRouteParams<{ org: string }>()
  const user = await parseBody<{ name: string }>()
  return { org: get('org'), created: user.name }
})

app.listen(3000)
```
