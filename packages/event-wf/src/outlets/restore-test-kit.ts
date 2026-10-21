/*
 * Fault injection shared by the restore specs (restore-stages, restore-forks): every stage of a
 * trigger request after the token is consumed can be made to throw.
 */
import { outletHttp } from '@prostojs/wf/outlets'
import type { WfOutlet, WfStateStrategy } from '@prostojs/wf/outlets'

import { useWfState } from '../composables'
import { createWfApp } from '../wf-adapter'
import type { WooksWf } from '../wf-adapter'

import { createHttpOutlet } from './create-outlet'
import { quietLogger } from './test-utils'
import type { WfOutletTriggerConfig } from './types'
import { swapStrategy } from './use-wf-strategy'

/**
 * What fails: `stage` — the stage that throws (`undefined` = none); `swap` — the second step
 * swaps to strategy `'other'` before pausing.
 */
export const faults: { stage?: string; swap?: boolean } = {}

export function resetFaults(): void {
  faults.stage = undefined
  faults.swap = false
}

/** Throws while `stage` is the injected one. */
export function fail(stage: string): void {
  if (faults.stage === stage) {
    throw new Error(`injected: ${stage}`)
  }
}

/**
 * Flows `one` (`ask`) and `two` (`ask` → `ask2`). `ask` fails on resume at stage `'resume'`;
 * `ask2` swaps to an unregistered strategy at `'pause strategy'`, to `'other'` when
 * `faults.swap`, and pauses on an unknown outlet at `'unknown outlet'`.
 */
export function makeFaultApp(): WooksWf<Record<string, unknown>> {
  const app = createWfApp<Record<string, unknown>>({ logger: quietLogger })
  app.step('ask', {
    handler: () => {
      if (!useWfState().input()) {
        return outletHttp({ step: 'ask' })
      }
      fail('resume')
    },
  })
  app.step('ask2', {
    handler: () => {
      if (useWfState().input()) {
        return
      }
      if (faults.stage === 'pause strategy') {
        swapStrategy('missing')
      } else if (faults.swap) {
        swapStrategy('other')
      }
      if (faults.stage === 'unknown outlet') {
        return { inputRequired: { outlet: 'nowhere' } }
      }
      return outletHttp({ step: 'ask2' })
    },
  })
  app.flow('two', ['ask', 'ask2'])
  app.flow('one', ['ask'])
  return app
}

/** `inner`, with `persist()` failing at stage `'persist'`. */
export function failingPersist(inner: WfStateStrategy): WfStateStrategy {
  return {
    persist: (state, opts, overrides) => {
      fail('persist')
      return inner.persist(state, opts, overrides)
    },
    persistEntry: inner.persistEntry?.bind(inner),
    retrieve: (t) => inner.retrieve(t),
    consume: (t) => inner.consume(t),
    consumeEntry: inner.consumeEntry?.bind(inner),
  }
}

/** The HTTP outlet, its delivery failing at stage `'deliver'`. */
export function failingHttpOutlet(): WfOutlet {
  const outlet = createHttpOutlet()
  return {
    ...outlet,
    deliver: (req, token) => {
      fail('deliver')
      return outlet.deliver(req, token)
    },
  }
}

/** Trigger hooks failing at `'before persist'`, `'render paused'` / `'render finished'`, `'on finished'`. */
export function failingHooks(): Pick<
  WfOutletTriggerConfig,
  'beforePersist' | 'renderEnvelope' | 'onFinished'
> {
  return {
    beforePersist: () => fail('before persist'),
    renderEnvelope: (envelope, info) => {
      fail(info.phase === 'paused' ? 'render paused' : 'render finished')
      return envelope
    },
    onFinished: () => {
      fail('on finished')
      return { finished: true }
    },
  }
}
