import type { EventContext } from '@wooksjs/event-core'

import { defineWfWook } from '../run-context'

import { outletsRegistryKey } from './outlet-context'

/**
 * Composable for accessing outlet infrastructure from within workflow steps.
 *
 * Most steps don't need this — they just return `outletHttp(form)` or
 * `outletEmail(to, template)`. This composable is for advanced cases
 * where steps need to inspect or modify outlet state directly.
 */
export const useWfOutlet = defineWfWook((ctx: EventContext) => ({
  getOutlets: () => ctx.get(outletsRegistryKey),
  getOutlet: (name: string) => ctx.get(outletsRegistryKey)?.get(name) ?? null,
}))
