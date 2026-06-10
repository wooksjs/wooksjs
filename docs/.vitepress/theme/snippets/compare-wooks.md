```ts
// Just call what you need
app.post('/users', async () => {
  const { credentials } = useAuthorization()
  await verifyToken(credentials()) // your check — throw HttpError(401) on failure
  const user = await useBody().parseBody<User>()
  return { name: user.name } // status 201 is default for POST
})
```
