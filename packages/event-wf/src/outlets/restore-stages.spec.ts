import { HandleStateStrategy, WfStateStoreMemory } from '@prostojs/wf/outlets'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearGlobalWooks } from 'wooks'

import { createOutletHandler } from './create-handler'
import {
  failingHooks,
  failingHttpOutlet,
  failingPersist,
  faults,
  makeFaultApp,
  resetFaults,
} from './restore-test-kit'
import { postJson } from './test-utils'
import type { WfOutletTriggerConfig } from './types'

/*
 * Review M2 — restoreOnError covers EVERY failure after the token is consumed, not just the
 * step: the resumed step, `beforePersist`, an unknown pause strategy, an unknown outlet,
 * `persist()`, delivery after a strategy swap, `renderEnvelope`, `onFinished`.
 *
 * Rule: with `restoreOnError`, a failure after consume leaves the token retryable (the pre-step
 * state is put back, within `maxRestores` and the predicate); without it, the token is spent —
 * unless the new state was already persisted under the SAME handle (then the token resumes
 * that new state either way: delivery and rendering failures after persistence).
 */

interface Stage {
  name: string
  flow: 'one' | 'two'
  /** the new state was persisted under the SAME handle before the failure */
  persistedFirst?: boolean
}
const STAGES: Stage[] = [
  { name: 'resume', flow: 'two' },
  { name: 'before persist', flow: 'two' },
  { name: 'pause strategy', flow: 'two' },
  { name: 'unknown outlet', flow: 'two' },
  { name: 'persist', flow: 'two' },
  { name: 'deliver after swap', flow: 'two' },
  { name: 'deliver', flow: 'two', persistedFirst: true },
  { name: 'render paused', flow: 'two', persistedFirst: true },
  { name: 'render finished', flow: 'one' },
  { name: 'on finished', flow: 'one' },
]

function config(restoreOnError: boolean): WfOutletTriggerConfig {
  const faulty = () => failingPersist(new HandleStateStrategy({ store: new WfStateStoreMemory() }))
  return {
    state: { strategies: { default: faulty(), other: faulty() }, default: 'default' },
    outlets: [failingHttpOutlet()],
    restoreOnError,
    ...failingHooks(),
  }
}

beforeEach(() => {
  clearGlobalWooks()
  resetFaults()
})

describe('a failure at any stage after consume', () => {
  for (const stage of STAGES) {
    for (const restoreOnError of [true, false]) {
      const retryable = restoreOnError || stage.persistedFirst
      it(`${stage.name}, restoreOnError ${restoreOnError} → token ${retryable ? 'retryable' : 'spent'}`, async () => {
        const handle = createOutletHandler(makeFaultApp())
        const cfg = config(restoreOnError)
        const started = await postJson(() => handle(cfg), { wfid: stage.flow })
        const token = started.body.wfs as string
        expect(typeof token).toBe('string')

        faults.stage = stage.name
        // 'deliver after swap': delivery fails once the state went under strategy 'other'
        faults.swap = stage.name === 'deliver after swap'
        if (faults.swap) {
          faults.stage = 'deliver'
        }
        const failed = await postJson(() => handle(cfg), { wfs: token, input: { a: 1 } })
        expect(failed.error?.message).toMatch(/injected|missing|nowhere|Unknown outlet/u)

        resetFaults()
        const retry = await postJson(() => handle(cfg), { wfs: token, input: { a: 1 } })
        if (retryable) {
          expect(retry.error, String(retry.error)).toBeUndefined()
        } else {
          expect(retry.status).toBe(410)
          expect(retry.body).toMatchObject({ code: 'WF_EXPIRED' })
        }
      })
    }
  }
})
