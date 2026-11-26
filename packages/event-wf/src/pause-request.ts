import type { WfOutletRequest } from '@prostojs/wf/outlets'

/**
 * `WfOutletRequest` extended with the strategy name that was active when the
 * workflow paused. The WF adapter augments `output.inputRequired` with this
 * field so callers can persist the next token under the post-swap strategy
 * without depending on EventContext write-through.
 *
 * The field is named generically (`stateStrategy`) — outlet handlers that
 * don't care about strategies ignore it; outlet triggers and offline
 * resume drivers read it to look up the right strategy in their registry.
 */
export type WfPauseRequest<P = unknown> = WfOutletRequest<P> & {
  stateStrategy?: string
  /**
   * `true` when a step of the run called `renewStateToken()`: persist this pause under a FRESH
   * handle, never under the one the run was resumed with. The outlet trigger honours it; an
   * offline resume driver that re-uses handles should too.
   */
  renewStateToken?: boolean
}
