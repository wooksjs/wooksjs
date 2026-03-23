import { defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'

import { outletsRegistryKey, stateStrategyKey } from './outlet-context'

/**
 * Composable for accessing outlet infrastructure from within workflow steps.
 *
 * Most steps don't need this — they just return `outletHttp(form)` or
 * `outletEmail(to, template)`. This composable is for advanced cases
 * where steps need to inspect or modify outlet state directly.
 */
export const useWfOutlet = defineWook((ctx: EventContext) => ({
  getStateStrategy: () => ctx.get(stateStrategyKey),
  getOutlets: () => ctx.get(outletsRegistryKey),
  getOutlet: (name: string) => ctx.get(outletsRegistryKey)?.get(name) ?? null,
}))
