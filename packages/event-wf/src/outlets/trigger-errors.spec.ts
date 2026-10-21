import { HttpError, createHttpApp, prepareTestHttpContext } from '@wooksjs/event-http'
import { HandleStateStrategy, WfStateStoreMemory, outletHttp } from '@prostojs/wf/outlets'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Wooks, clearGlobalWooks } from 'wooks'

import { useWfState } from '../composables'
import { createWfApp } from '../wf-adapter'
import type { WooksWf } from '../wf-adapter'

import { createOutletHandler } from './create-handler'
import { createHttpOutlet } from './create-outlet'
import { WF_TRIGGER_ERRORS } from './errors'
import { postJson, quietLogger } from './test-utils'
import { handleWfOutletRequest } from './trigger'
import type { WfOutletTriggerConfig } from './types'

/*
 * F35 contract: every request the trigger refuses is THROWN as an `HttpError` (so error
 * interceptors and `transformErrorBody` see it), with the documented status, an UPPER_SNAKE
 * `code` and `params`. The table below is the documented one; each row is provoked for real.
 */

beforeEach(() => clearGlobalWooks())

function makeApp() {
  const app = createWfApp<Record<string, unknown>>({ logger: quietLogger })
  app.step('ask', {
    handler: () => (useWfState().input() ? undefined : outletHttp({ fields: ['x'] })),
  })
  app.step('bad-outlet', { handler: () => ({ inputRequired: { outlet: 'nowhere' } }) })
  app.flow('form', ['ask'])
  app.flow('admin', ['ask'])
  app.flow('broken', ['bad-outlet'])
  return app
}

function config(extra: Partial<WfOutletTriggerConfig> = {}): WfOutletTriggerConfig {
  return {
    state: new HandleStateStrategy({ store: new WfStateStoreMemory() }),
    outlets: [createHttpOutlet()],
    ...extra,
  }
}

const call = (app: WooksWf, cfg: WfOutletTriggerConfig, body: unknown) =>
  postJson(() => createOutletHandler(app)(cfg), body)

describe('trigger refusals throw HttpError with a code', () => {
  it('missing wfs and wfid → 400 WF_MISSING', async () => {
    const { error } = await call(makeApp(), config(), {})
    expect(error).toBeInstanceOf(HttpError)
    expect(error!.body).toMatchObject({ statusCode: 400, code: 'WF_MISSING' })
  })

  it('non-string wfid → 400 WF_INVALID', async () => {
    const { error } = await call(makeApp(), config(), { wfid: ['form'] })
    expect(error!.body).toMatchObject({ statusCode: 400, code: 'WF_INVALID' })
  })

  it('malformed token / unknown strategy → 410 WF_INVALID_TOKEN', async () => {
    for (const wfs of ['no-dot', 'nope.abc', 'constructor.abc', '.abc', 'default.']) {
      const { error } = await call(makeApp(), config(), { wfs })
      expect(error!.body, wfs).toMatchObject({ statusCode: 410, code: 'WF_INVALID_TOKEN' })
    }
  })

  it('unknown or spent handle → 410 WF_EXPIRED', async () => {
    const app = makeApp()
    const cfg = config()
    const { body: result } = await call(app, cfg, { wfid: 'form' })
    const wfs = (result as { wfs: string }).wfs
    expect((await call(app, cfg, { wfs, input: { x: 1 } })).error).toBeUndefined()
    const { error } = await call(app, cfg, { wfs, input: { x: 1 } })
    expect(error!.body).toMatchObject({ statusCode: 410, code: 'WF_EXPIRED' })
  })

  it('not allowed / blocked on start → 403 WF_FORBIDDEN with params', async () => {
    const notAllowed = await call(makeApp(), config({ allow: ['form'] }), { wfid: 'admin' })
    expect(notAllowed.error!.body).toMatchObject({
      statusCode: 403,
      code: 'WF_FORBIDDEN',
      params: { wfid: 'admin', reason: 'not-allowed' },
    })
    const blocked = await call(makeApp(), config({ block: ['admin'] }), { wfid: 'admin' })
    expect(blocked.error!.body).toMatchObject({
      statusCode: 403,
      code: 'WF_FORBIDDEN',
      params: { wfid: 'admin', reason: 'blocked' },
    })
  })

  it('refused resume → 403 WF_FORBIDDEN without the flow id', async () => {
    const app = makeApp()
    const store = new WfStateStoreMemory()
    const open = config({ state: new HandleStateStrategy({ store }) })
    const wfs = ((await call(app, open, { wfid: 'admin' })).body as { wfs: string }).wfs
    const guarded = config({ state: new HandleStateStrategy({ store }), allow: ['form'] })
    const { error } = await call(app, guarded, { wfs, input: { x: 1 } })
    expect(error!.body).toMatchObject({
      statusCode: 403,
      code: 'WF_FORBIDDEN',
      params: { reason: 'not-allowed' },
    })
    expect(JSON.stringify(error!.body)).not.toContain('admin')
  })

  it('unresolvable wfid while lists are set → 404 WF_NOT_FOUND', async () => {
    const { error } = await call(makeApp(), config({ block: ['admin'] }), { wfid: 'missing' })
    expect(error!.body).toMatchObject({
      statusCode: 404,
      code: 'WF_NOT_FOUND',
      params: { wfid: 'missing' },
    })
  })

  it('a pause on an unregistered outlet → 500 WF_UNKNOWN_OUTLET', async () => {
    const { error } = await call(makeApp(), config(), { wfid: 'broken' })
    expect(error!.body).toMatchObject({
      statusCode: 500,
      code: 'WF_UNKNOWN_OUTLET',
      params: { outlet: 'nowhere' },
    })
  })

  it('the documented table matches what is thrown', () => {
    expect(Object.keys(WF_TRIGGER_ERRORS).toSorted()).toEqual(
      [
        'WF_EXPIRED',
        'WF_FORBIDDEN',
        'WF_INVALID',
        'WF_INVALID_TOKEN',
        'WF_MISSING',
        'WF_NOT_FOUND',
        'WF_UNKNOWN_OUTLET',
      ].toSorted(),
    )
    expect(WF_TRIGGER_ERRORS.WF_EXPIRED.status).toBe(410)
    expect(WF_TRIGGER_ERRORS.WF_FORBIDDEN.status).toBe(403)
  })
})

describe('over HTTP: the error reaches transformErrorBody and the wire', () => {
  let http: ReturnType<typeof createHttpApp>
  let base: string
  const seen: string[] = []

  beforeAll(async () => {
    clearGlobalWooks()
    const wf = makeApp()
    const handle = createOutletHandler(wf)
    http = createHttpApp(
      {
        logger: quietLogger,
        transformErrorBody: (body) => {
          seen.push(String(body.code))
          return body
        },
      },
      new Wooks(),
    )
    http.post('/wf', () => handle(config({ allow: ['form'] })))
    await http.listen(0, '127.0.0.1')
    base = `http://127.0.0.1:${(http.getServer()!.address() as { port: number }).port}`
  })
  afterAll(() => http.close())

  it('sends status + { statusCode, error, message, code, params }', async () => {
    const res = await fetch(`${base}/wf`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ wfid: 'admin' }),
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      message: "Workflow 'admin' is not allowed",
      code: 'WF_FORBIDDEN',
      params: { wfid: 'admin', reason: 'not-allowed' },
    })
    expect(seen).toContain('WF_FORBIDDEN')
  })
})

// keep the direct entry point covered too
it('handleWfOutletRequest throws the same errors', async () => {
  const app = makeApp()
  const run = prepareTestHttpContext({
    url: '/wf',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    rawBody: '{}',
  })
  await expect(
    run(() =>
      handleWfOutletRequest(config(), { start: app.start.bind(app), resume: app.resume.bind(app) }),
    ),
  ).rejects.toMatchObject({ body: { code: 'WF_MISSING' } })
})
