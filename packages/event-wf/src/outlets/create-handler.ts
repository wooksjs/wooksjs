import { handleWfOutletRequest } from './trigger'
import type { WfOutletTriggerConfig, WfOutletTriggerDeps } from './types'

/**
 * Creates a pre-wired outlet handler from a workflow app instance.
 * Eliminates the need to manually construct `WfOutletTriggerDeps`.
 *
 * Accepts any object with `start` and `resume` methods (WooksWf, MoostWf, etc.).
 *
 * @example
 * ```ts
 * const handle = createOutletHandler(wfApp)
 * httpApp.post('/workflow', () => handle(config))
 * ```
 */
export function createOutletHandler(wfApp: {
  start: WfOutletTriggerDeps['start']
  resume: WfOutletTriggerDeps['resume']
}) {
  return (config: WfOutletTriggerConfig) =>
    handleWfOutletRequest(config, {
      start: (schemaId, context, opts) => wfApp.start(schemaId, context, opts),
      resume: (state, opts) => wfApp.resume(state, opts),
    })
}
