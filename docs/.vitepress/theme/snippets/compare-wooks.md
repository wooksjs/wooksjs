```ts
// Just call what you need
app.post('/users', async () => {
  await useAuthorization()
  const user = await useBody().parseBody<User>()
  return { name: user.name } // status 201 is default for POST
})
```
