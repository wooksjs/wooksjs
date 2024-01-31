import type { TTimeMultiString } from './time'
import { convertTime } from './time'

export interface TCacheControl {
  mustRevalidate?: boolean
  noCache?: boolean | string
  noStore?: boolean
  noTransform?: boolean
  public?: boolean
  private?: boolean | string
  proxyRevalidate?: boolean
  maxAge?: number | TTimeMultiString
  sMaxage?: number | TTimeMultiString
}

export function renderCacheControl(data: TCacheControl) {
  let attrs = ''
  for (const [a, v] of Object.entries(data)) {
    if (v === undefined) {
      continue
    }
    const func: (v: unknown) => string = cacheControlFunc[a as keyof typeof cacheControlFunc] as (
      v: unknown
    ) => string
    if (typeof func === 'function') {
      const val = func(v)
      if (val) {
        attrs += attrs ? `, ${val}` : val
      }
    } else {
      throw new TypeError(`Unknown Cache-Control attribute ${a}`)
    }
  }
  return attrs
}

// rfc7234#section-5.2.2
const cacheControlFunc = {
  mustRevalidate: (v: TCacheControl['mustRevalidate']) => (v ? 'must-revalidate' : ''),
  noCache: (v: TCacheControl['noCache']) =>
    v ? (typeof v === 'string' ? `no-cache="${v}"` : 'no-cache') : '',
  noStore: (v: TCacheControl['noStore']) => (v ? 'no-store' : ''),
  noTransform: (v: TCacheControl['noTransform']) => (v ? 'no-transform' : ''),
  public: (v: TCacheControl['public']) => (v ? 'public' : ''),
  private: (v: TCacheControl['private']) =>
    v ? (typeof v === 'string' ? `private="${v}"` : 'private') : '',
  proxyRevalidate: (v: TCacheControl['proxyRevalidate']) => (v ? 'proxy-revalidate' : ''),
  maxAge: (v: Required<TCacheControl>['maxAge']) => `max-age=${convertTime(v, 's').toString()}`,
  sMaxage: (v: Required<TCacheControl>['sMaxage']) => `s-maxage=${convertTime(v, 's').toString()}`,
}
