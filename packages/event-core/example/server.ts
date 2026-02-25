/**
 * Example server — ties everything together
 *
 * Demonstrates: createHttpEvent, wooks, useCookie (cachedBy),
 *               useBody (extension), useLogger, ctx pass-through for perf,
 *               current() for mid-event context access
 */
import { createServer } from 'node:http'
import { current, useLogger } from '../src/index'
import { createHttpEvent, useRequest, useResponse, useCookie } from './http-context'
import { useBody } from './body-parser'

const logger = {
  info: (...args: unknown[]) => console.log('[INFO]', ...args),
  warn: (...args: unknown[]) => console.warn('[WARN]', ...args),
  error: (...args: unknown[]) => console.error('[ERR]', ...args),
  debug: (...args: unknown[]) => console.debug('[DBG]', ...args),
}

// ── Auth middleware (uses composables independently) ──

async function authenticate() {
  const session = useCookie('session')
  if (!session) {
    throw new Error('Unauthorized')
  }

  const log = useLogger()
  log.info(`Authenticated session: ${session}`)
  return { userId: 'u-123', role: 'admin' }
}

// ── Handler ──

async function handleCreatePost() {
  // Performance: one ALS lookup, reuse ctx across wooks
  const ctx = current()
  const { method, params } = useRequest(ctx)
  const { parseBody } = useBody(ctx)
  const { status } = useResponse(ctx)
  const log = ctx.logger // direct access — same as useLogger()

  // cachedBy: extract one cookie, cached per name per event
  const theme = useCookie('theme', ctx) ?? 'light'

  log.info(`${method} /posts/${params.id} (theme: ${theme})`)

  // Async cached: body is read + parsed once, even if auth already parsed it
  const body = await parseBody()
  log.debug('Parsed body:', body)

  // Response
  status(201).json({ id: params.id, ...body, theme })
}

// ── Server ──

const server = createServer((req, res) => {
  // Simple router (placeholder)
  const routeParams = { id: '42' }

  createHttpEvent({ req, res, routeParams, logger }, async () => {
    try {
      await authenticate()
      await handleCreatePost()
    } catch (error) {
      const { status } = useResponse()
      const log = useLogger()
      log.error('Request failed:', error)
      status(500).json({ error: 'Internal server error' })
    }
  })
})

server.listen(3000, () => {
  logger.info('Listening on http://localhost:3000')
})
