```ts
// Middleware chain + req/res threading
app.post('/users',
  bodyParser.json(),
  authenticate,
  async (req, res) => {
    res.status(201).json({ name: req.body.name })
  }
)
```
