import { EventContext, run } from '@wooksjs/event-core'
import { HandleStateStrategy, WfStateStoreMemory } from '@prostojs/wf/outlets'
import { describe, expect, it, vi } from 'vitest'

import { createWfApp } from '../wf-adapter'

import { createHttpOutlet } from './create-outlet'
import { postJson } from './test-utils'
import { handleWfOutletRequest } from './trigger'
import { warnOnce } from './warn-once'

// Own file: warn-once state is per module instance, so nothing else has warned yet.

describe('warnOnce', () => {
  it('logs once per key', () => {
    const warn = vi.fn()
    const ctx = new EventContext({ logger: { warn, info() {}, error() {}, debug() {} } as any })
    run(ctx, () => {
      warnOnce('k1', 'first')
      warnOnce('k1', 'again')
      warnOnce('k2', 'second')
    })
    expect(warn.mock.calls.map((c) => c[0])).toEqual(['first', 'second'])
  })

  it('an outlet trigger with lists but no resolver warns once across requests', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const app = createWfApp()
      app.step('noop', { handler: () => {} })
      app.flow('simple', ['noop'])
      const deps = {
        start: (s: string, c: unknown, o: any) => app.start(s, c, o) as any,
        resume: (s: any, o: any) => app.resume(s, o) as any,
      }
      const config = () => ({
        state: new HandleStateStrategy({ store: new WfStateStoreMemory() }),
        outlets: [createHttpOutlet()],
        block: ['other'],
      })
      await postJson(() => handleWfOutletRequest(config(), deps), { wfid: 'simple' })
      await postJson(() => handleWfOutletRequest(config(), deps), { wfid: 'simple' })
      const hits = warn.mock.calls.filter((c) => String(c[0]).includes('resolveSchemaId'))
      expect(hits).toHaveLength(1)
    } finally {
      warn.mockRestore()
    }
  })
})
