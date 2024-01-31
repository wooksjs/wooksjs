import { attachHook } from '@wooksjs/event-core'

import { useHttpContext } from '../event-http'
import type { EHttpStatusCode } from '../utils/status-codes'

interface TUseResponseOptions {
  passthrough: boolean // when true: keep building response via framework
}

export function useResponse() {
  const { store } = useHttpContext()
  const event = store('event')
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const res = event.get('res')!
  const responded = store('response').hook('responded')
  const statusCode = store('status').hook('code')

  function status(code?: EHttpStatusCode) {
    return (statusCode.value = code ? code : statusCode.value)
  }

  const rawResponse = (options?: TUseResponseOptions) => {
    if (!options || !options.passthrough) {
      responded.value = true
    }
    return res
  }

  return {
    rawResponse,
    hasResponded: () => responded.value || !res.writable || res.writableEnded,
    status: attachHook(status, {
      get: () => statusCode.value,
      set: (code: EHttpStatusCode) => (statusCode.value = code),
    }),
  }
}

export function useStatus() {
  const { store } = useHttpContext()
  return store('status').hook('code')
}

export type TStatusHook = ReturnType<typeof useStatus>
