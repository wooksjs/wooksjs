import { HandleStateStrategy, WfStateStoreMemory, outletHttp } from '@prostojs/wf/outlets'
import { current } from '@wooksjs/event-core'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearGlobalWooks } from 'wooks'

import type { WfPauseRequest } from '../pause-request'
import { createWfApp } from '../wf-adapter'

import { mintWfToken } from './mint'
import { quietLogger } from './test-utils'
import { renewStateToken, swapStrategy, useWfStrategy } from './use-wf-strategy'

/*
 * A run started inside a step (`app.start(…, { eventContext: current() })`, `mintWfToken(…,
 * { eventContext: current() })`) is its own workflow run: its strategy name, swaps and renewals
 * never reach the enclosing run, and the enclosing run's never reach it.
 */

beforeEach(() => clearGlobalWooks())

type Out = { inputRequired?: unknown } | undefined
const pause = (out: Out) => out?.inputRequired as WfPauseRequest | undefined

function makeApp() {
  return createWfApp<Record<string, unknown>>({ logger: quietLogger })
}

describe('nested workflow runs', () => {
  it('a nested renewal stays in the nested run, also when the outer step already used useWfStrategy()', async () => {
    const app = makeApp()
    let inner: Out
    app.step('inner-renews', { handler: () => renewStateToken() ?? outletHttp({}) })
    app.flow('inner-renews', ['inner-renews'])
    app.step('outer', {
      handler: async () => {
        useWfStrategy().current() // the outer step reads the composable first
        inner = await app.start('inner-renews', {}, { eventContext: current() })
        return outletHttp({})
      },
    })
    app.flow('outer', ['outer'])

    const outer = await app.start('outer', {}, { strategy: { name: 'store' } })
    expect(pause(inner)?.renewStateToken).toBe(true)
    expect(pause(outer)?.renewStateToken).toBeUndefined()
  })

  it('a nested swapStrategy() stays in the nested run, also when the outer step already used useWfStrategy()', async () => {
    const app = makeApp()
    let inner: Out
    app.step('inner-swaps', { handler: () => swapStrategy('enc') ?? outletHttp({}) })
    app.flow('inner-swaps', ['inner-swaps'])
    app.step('outer', {
      handler: async () => {
        useWfStrategy().current()
        inner = await app.start(
          'inner-swaps',
          {},
          {
            eventContext: current(),
            strategy: { name: 'store' },
          },
        )
        return outletHttp({})
      },
    })
    app.flow('outer', ['outer'])

    const outer = await app.start('outer', {}, { strategy: { name: 'store' } })
    expect(pause(inner)?.stateStrategy).toBe('enc')
    expect(pause(outer)?.stateStrategy).toBe('store')
  })

  it('a nested start({ strategy }) does not overwrite the outer run strategy name', async () => {
    const app = makeApp()
    let inner: Out
    let seen: string | undefined
    app.step('inner', { handler: () => outletHttp({}) })
    app.flow('inner', ['inner'])
    app.step('outer', {
      handler: async () => {
        inner = await app.start('inner', {}, { eventContext: current(), strategy: { name: 'enc' } })
        seen = useWfStrategy().current()
        return outletHttp({})
      },
    })
    app.flow('outer', ['outer'])

    const outer = await app.start('outer', {}, { strategy: { name: 'store' } })
    expect(pause(inner)?.stateStrategy).toBe('enc')
    expect(seen).toBe('store')
    expect(pause(outer)?.stateStrategy).toBe('store')
  })

  it('mintWfToken(…, { eventContext: current() }) inside a step keeps the outer run’s strategy', async () => {
    const app = makeApp()
    const strategies = {
      store: new HandleStateStrategy({ store: new WfStateStoreMemory() }),
      enc: new HandleStateStrategy({ store: new WfStateStoreMemory() }),
    }
    let minted: string | undefined
    app.step('inner', { handler: () => outletHttp({}) })
    app.flow('inner', ['inner'])
    app.step('outer', {
      handler: async () => {
        const result = await mintWfToken(app, {
          wfid: 'inner',
          state: { strategies, default: 'enc' },
          eventContext: current(),
        })
        minted = result.token
        return outletHttp({})
      },
    })
    app.flow('outer', ['outer'])

    const outer = await app.start('outer', {}, { strategy: { name: 'store' } })
    expect(minted).toMatch(/^enc\./)
    expect(pause(outer)?.stateStrategy).toBe('store')
  })

  it('an outer renewal does not reach a nested run', async () => {
    const app = makeApp()
    let inner: Out
    app.step('inner', { handler: () => outletHttp({}) })
    app.flow('inner', ['inner'])
    app.step('outer', {
      handler: async () => {
        renewStateToken()
        inner = await app.start('inner', {}, { eventContext: current(), strategy: { name: 'x' } })
        return outletHttp({})
      },
    })
    app.flow('outer', ['outer'])

    const outer = await app.start('outer', {}, { strategy: { name: 'store' } })
    expect(pause(outer)?.renewStateToken).toBe(true)
    expect(pause(inner)?.renewStateToken).toBeUndefined()
  })

  it('useWfStrategy().current() in a run without a strategy name throws, also when nested in one that has one', async () => {
    const app = makeApp()
    const seen: Record<string, unknown> = {}
    const read = () => {
      try {
        return useWfStrategy().current()
      } catch (error) {
        return (error as Error).message
      }
    }
    app.step('inner', {
      handler: () => {
        seen.inner = read()
        return outletHttp({})
      },
    })
    app.flow('inner', ['inner'])
    app.step('outer', {
      handler: async () => {
        await app.start('inner', {}, { eventContext: current() }) // no strategy
        seen.outer = read()
        return outletHttp({})
      },
    })
    app.flow('outer', ['outer'])

    await app.start('outer', {}, { strategy: { name: 'store' } })
    expect(seen).toEqual({ inner: 'Key "wf.strategyName" is not set', outer: 'store' })
    // a top-level run without a strategy name (an offline start()) — as before
    await app.start('inner', {})
    expect(seen.inner).toBe('Key "wf.strategyName" is not set')
  })
})

describe('paused output', () => {
  it('stateStrategy and renewStateToken go on a copy: a shared outlet object is never written', async () => {
    const app = makeApp()
    const shared = outletHttp({ step: 's' })
    let renew = false
    app.step('s', {
      handler: () => {
        if (renew) {
          renewStateToken()
        }
        return shared
      },
    })
    app.flow('s', ['s'])

    renew = true
    const first = await app.start('s', {}, { strategy: { name: 'store' } })
    expect(pause(first)).toMatchObject({ stateStrategy: 'store', renewStateToken: true })
    expect(shared.inputRequired).toEqual({ outlet: 'http', payload: { step: 's' } })

    // a driver that passes no strategy and asks for no renewal sees neither
    renew = false
    const second = await app.start('s', {})
    expect(pause(second)?.stateStrategy).toBeUndefined()
    expect(pause(second)?.renewStateToken).toBeUndefined()
  })
})
