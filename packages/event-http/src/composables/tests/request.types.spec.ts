import { describe, expectTypeOf, it } from 'vitest'

import type { useRequest } from '../request'

type TGetIp = ReturnType<typeof useRequest>['getIp']

/*
 * Type contract (checked by `tsc`, see vitest.config.js): `getIp()` takes no argument; the
 * deprecated `{ trustProxy }` option may also come from a maybe-undefined variable.
 */
describe('useRequest().getIp typing', () => {
  it('accepts no argument, the deprecated option, or an option that may be undefined', () => {
    const maybe = undefined as { trustProxy: boolean } | undefined
    const calls = (getIp: TGetIp) => [
      getIp(),
      getIp({ trustProxy: true }),
      getIp(maybe),
      getIp(undefined),
    ]
    expectTypeOf(calls).returns.toEqualTypeOf<string[]>()
  })
})
