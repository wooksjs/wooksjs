export { useWfOutlet } from './use-wf-outlet'
export { useWfFinished } from './use-wf-finished'
export { useWfStrategy, swapStrategy } from './use-wf-strategy'
export type { WfPauseRequest } from '../pause-request'
export type { WfFinishedResponse } from './outlet-context'
export { handleWfOutletRequest } from './trigger'
export { normalizeWfId } from '../wf-id'
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
  type WfPersistOptions,
  type WfPersistedEntry,
  type WfConsumedEntry,
  type WfStateStoreEntry,
  type WfHandleHashOptions,
  resolveExpiresAt,
  hashWfHandle,
  EncapsulatedStateStrategy,
  HandleStateStrategy,
  WfStateStoreMemory,
} from '@prostojs/wf/outlets'
