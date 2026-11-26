import {
  HandleStateStrategy,
  WfStateStoreMemory,
  outletEmail,
  outletHttp,
} from '@prostojs/wf/outlets'
import { current, routeParamsKey, useRouteParams } from '@wooksjs/event-core'
import { prepareTestHttpContext, useHeaders } from '@wooksjs/event-http'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearGlobalWooks } from 'wooks'

import { useWfState } from './composables'
import { createHttpOutlet } from './outlets/create-outlet'
import { createOutletHandler } from './outlets/create-handler'
import { mintWfToken } from './outlets/mint'
import { quietLogger } from './outlets/test-utils'
import { useWfFinished } from './outlets/use-wf-finished'
import { useWfOutlet } from './outlets/use-wf-outlet'
import { useWfStrategy } from './outlets/use-wf-strategy'
import { createWfApp } from './wf-adapter'

/*
 * A run started inside a step (`app.start(…, { eventContext: current() })`, `mintWfToken(…,
 * { eventContext: current() })`) is its own run: every wf composable called in its steps acts on
 * IT — never on the enclosing run's object, whether or not the enclosing step called the
 * composable first — while HTTP composables still read the request it runs in.
 */

beforeEach(() => clearGlobalWooks())

interface Ctx {
  who?: string
  visited?: string
}

const composables = () => ({
  state: useWfState(),
  finished: useWfFinished(),
  outlet: useWfOutlet(),
  strategy: useWfStrategy(),
})
type Objects = ReturnType<typeof composables>

describe('wf composables in a run started inside a step', () => {
  for (const outerFirst of [true, false]) {
    it(`act on the inner run (the outer step called them first: ${outerFirst})`, async () => {
      const app = createWfApp<Ctx>({ logger: quietLogger })
      let inner: Objects | undefined
      let outer: Objects | undefined
      const seen: Record<string, unknown> = {}
      app.step('inner', {
        handler: () => {
          inner = composables()
          seen.innerWho = useWfState().ctx<Ctx>().who
          seen.innerSchema = useWfState().schemaId
          seen.innerResume = useWfState().resume
          seen.innerStrategy = useWfStrategy().current()
          useWfFinished().set({ type: 'data', value: 'inner' })
          return outletHttp({})
        },
      })
      app.flow('inner', ['inner'])
      let paused = false
      app.step('outer', {
        handler: async () => {
          // pause once, without touching a composable
          if (!paused) {
            paused = true
            return outletHttp({})
          }
          if (outerFirst) {
            outer = composables()
          }
          await app.start(
            'inner',
            { who: 'inner' },
            {
              eventContext: current(),
              strategy: { name: 'enc' },
            },
          )
          outer ??= composables()
          seen.outerWho = useWfState().ctx<Ctx>().who
          seen.outerResume = useWfState().resume
          seen.outerFinished = useWfFinished().get()
          seen.outerStrategy = useWfStrategy().current()
          return outletHttp({})
        },
      })
      app.flow('outer', ['outer'])

      const first = await app.start('outer', { who: 'outer' }, { strategy: { name: 'store' } })
      // the run under test is a RESUME (resume: true) that starts the inner run (resume: false)
      await app.resume(first.state, { input: { go: true }, strategy: { name: 'store' } })

      for (const name of ['state', 'finished', 'outlet', 'strategy'] as const) {
        expect(inner?.[name], name).not.toBe(outer?.[name])
      }
      expect(seen).toEqual({
        innerWho: 'inner',
        innerSchema: 'inner',
        innerResume: false,
        innerStrategy: 'enc',
        outerWho: 'outer',
        outerResume: true,
        outerFinished: undefined,
        outerStrategy: 'store',
      })
    })
  }

  it('a nested run that finishes does not set the trigger’s finished response', async () => {
    const app = createWfApp<Ctx>({ logger: quietLogger })
    app.step('inner', {
      handler: () => useWfFinished().set({ type: 'redirect', value: '/inner' }),
    })
    app.flow('inner', ['inner'])
    app.step('outer', {
      handler: async () => {
        await app.start('inner', {}, { eventContext: current() })
      },
    })
    app.flow('outer', ['outer'])
    const handle = createOutletHandler(app)

    const result = await prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'outer' }),
    })(() =>
      handle({
        state: new HandleStateStrategy({ store: new WfStateStoreMemory() }),
        outlets: [createHttpOutlet()],
      }),
    )
    expect(result).toEqual({ finished: true })
  })

  it('mintWfToken(…, { eventContext: current() }) in a step: the minted token carries the inner run’s state', async () => {
    const app = createWfApp<Ctx>({ logger: quietLogger })
    const strategy = new HandleStateStrategy({ store: new WfStateStoreMemory() })
    let minted: string | undefined
    let outerCtx: Ctx | undefined
    app.step('invite-mail', {
      handler: () => {
        const { ctx } = useWfState()
        ctx<Ctx>().visited = `inner saw ${ctx<Ctx>().who}`
        return outletEmail('invitee@example.com', 'invite')
      },
    })
    app.flow('invite', ['invite-mail'])
    app.step('admin', {
      handler: async () => {
        outerCtx = useWfState().ctx<Ctx>() // the outer step reads its state first
        const result = await mintWfToken(app, {
          wfid: 'invite',
          context: { who: 'invitee' },
          state: strategy,
          eventContext: current(),
        })
        minted = result.token
        return outletHttp({})
      },
    })
    app.flow('admin', ['admin'])

    await app.start('admin', { who: 'admin' }, { strategy: { name: 'default' } })
    const state = await strategy.retrieve(String(minted).split('.').slice(1).join('.'))
    expect(state).toMatchObject({
      schemaId: 'invite',
      context: { who: 'invitee', visited: 'inner saw invitee' },
    })
    expect(outerCtx).toEqual({ who: 'admin' })
  })
})

describe('a run inside an HTTP request', () => {
  it('reads the request’s HTTP composables, also from a nested run, and leaves its route params alone', async () => {
    const app = createWfApp<Ctx>({ logger: quietLogger })
    const seen: Record<string, unknown> = {}
    app.step('inner/:n', {
      handler: () => {
        seen.innerHeader = useHeaders()['x-test']
        seen.innerParam = useRouteParams().get('n')
        return outletHttp({})
      },
    })
    app.flow('inner', ['inner/2'])
    app.step('outer/:n', {
      handler: async () => {
        seen.outerHeader = useHeaders()['x-test']
        await app.start('inner', {}, { eventContext: current() })
        seen.outerParam = useRouteParams().get('n')
        return outletHttp({})
      },
    })
    app.flow('outer', ['outer/1'])

    const httpParams = await prepareTestHttpContext({ url: '/x', headers: { 'x-test': 'yes' } })(
      async () => {
        current().set(routeParamsKey, { id: 'http' })
        await app.start('outer', {}, { eventContext: current() })
        return useRouteParams().params
      },
    )
    expect(seen).toEqual({
      outerHeader: 'yes',
      innerHeader: 'yes',
      innerParam: '2',
      outerParam: '1',
    })
    expect(httpParams).toEqual({ id: 'http' })
  })
})
