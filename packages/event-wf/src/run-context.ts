import { cached, current } from '@wooksjs/event-core'
import type { EventContext, WookComposable } from '@wooksjs/event-core'

import { wfKind } from './wf-kind'

/*
 * A workflow run's own context holds everything that belongs to the run — its seeds, resume
 * flag, route params, strategy name, renewal request and the wf composables' objects. A run
 * started inside a step (`eventContext: current()`, `mintWfToken`) is a child of the enclosing
 * run's context, so anything read or written through the parent chain would reach the enclosing
 * run: per-run state is written with `setOwn` and read from the run's own context. Request-level
 * state (HTTP composables, the trigger's outlet registry) is still read through the chain.
 */

/** Whether `ctx` is a workflow run's own context (seeded as a workflow event). */
export function isRunContext(ctx: EventContext): boolean {
  return ctx.hasOwn(wfKind.keys.schemaId)
}

/**
 * The context of the innermost workflow run around `ctx` (a step, a flow `init`): the nearest
 * context in the parent chain seeded as a workflow event — `undefined` outside any run.
 */
export function runContext(ctx: EventContext = current()): EventContext | undefined {
  let c: EventContext | undefined = ctx
  while (c && !isRunContext(c)) {
    c = c.parent
  }
  return c
}

/**
 * `defineWook` for workflow composables: the composable's object is created for, and cached on,
 * the innermost run around the caller — never read through from an enclosing run. Outside any
 * run it behaves exactly like `defineWook`. Every wf composable is defined with it.
 */
export function defineWfWook<T>(factory: (ctx: EventContext) => T): WookComposable<T> {
  const _slot = cached(factory)
  return Object.assign(
    ((ctx?: EventContext) => {
      const c = ctx ?? current()
      const run = runContext(c)
      return run ? run.getOwn(_slot) : c.get(_slot)
    }) as WookComposable<T>,
    { _slot },
  )
}
