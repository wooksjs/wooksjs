import { handleWfOutletRequest } from './trigger'
import type { WfOutletTriggerConfig, WfOutletTriggerDeps } from './types'

/**
 * Creates a pre-wired outlet handler from a workflow app instance.
 * Eliminates the need to manually construct `WfOutletTriggerDeps`.
 *
 * Accepts any object with `start` and `resume` methods (WooksWf, MoostWf, etc.).
 * When the object also has `resolveSchemaId` (WooksWf does), it is wired into
 * the deps so `allow`/`block` judge the flow a request actually runs.
 *
 * @example
 * ```ts
 * const handle = createOutletHandler(wfApp)
 * httpApp.post('/workflow', () => handle(config))
 * ```
 */
export function createOutletHandler(wfApp: WfOutletTriggerDeps) {
  const deps: WfOutletTriggerDeps = {
    start: wfApp.start.bind(wfApp),
    resume: wfApp.resume.bind(wfApp),
    resolveSchemaId: wfApp.resolveSchemaId?.bind(wfApp),
  }
  return (config: WfOutletTriggerConfig) => handleWfOutletRequest(config, deps)
}
