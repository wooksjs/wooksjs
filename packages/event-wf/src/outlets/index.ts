export { useWfOutlet } from './use-wf-outlet'
export { useWfFinished } from './use-wf-finished'
export type { WfFinishedResponse } from './outlet-context'
export { handleWfOutletRequest } from './trigger'
export type { WfOutletTokenConfig, WfOutletTriggerConfig, WfOutletTriggerDeps } from './types'
export { createHttpOutlet, createEmailOutlet } from './create-outlet'
export { createOutletHandler } from './create-handler'

// Re-export prostojs/wf/outlets for convenience
export {
  outlet,
  outletHttp,
  outletEmail,
  type WfOutlet,
  type WfOutletRequest,
  type WfOutletResult,
  type WfStateStrategy,
  type WfStateStore,
  type WfState,
  EncapsulatedStateStrategy,
  HandleStateStrategy,
  WfStateStoreMemory,
} from '@prostojs/wf/outlets'
