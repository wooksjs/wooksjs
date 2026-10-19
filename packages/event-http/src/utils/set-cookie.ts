import type { TCookieAttributes, TSetCookieData } from '../types'
import { convertTime } from './time'

const COOKIE_NAME_RE = /^[\w!#$%&'*+\-.^`|~]+$/

/** Characters `encodeURIComponent()` leaves as they are. */
const URI_SAFE_RE = /^[\w\-.!~*'()]*$/

function sanitizeCookieAttrValue(v: string): string {
  return v.replace(/[;\r\n]/g, '')
}

export function renderCookie(key: string, data: TSetCookieData) {
  if (!COOKIE_NAME_RE.test(key)) {
    throw new TypeError(`Invalid cookie name "${key}"`)
  }
  let attrs = ''
  const dataAttrs = data.attrs
  for (const a of Object.keys(dataAttrs)) {
    const func: (v: unknown) => string = cookieAttrFunc[a as keyof typeof cookieAttrFunc] as (
      v: unknown,
    ) => string
    if (typeof func === 'function') {
      const val = func(dataAttrs[a as keyof typeof dataAttrs])
      if (val) {
        attrs += `; ${val}`
      }
    } else {
      throw new TypeError(`Unknown Set-Cookie attribute ${a}`)
    }
  }
  // Most cookie values need no escaping — skip the encoder for those
  const encoded = URI_SAFE_RE.test(data.value) ? data.value : encodeURIComponent(data.value)
  return `${key}=${encoded}${attrs}`
}

const cookieAttrFunc = {
  expires: (v: TCookieAttributes['expires']) =>
    v === undefined
      ? ''
      : `Expires=${
          typeof v === 'string' || typeof v === 'number'
            ? new Date(v).toUTCString()
            : v.toUTCString()
        }`,
  maxAge: (v: TCookieAttributes['maxAge']) =>
    v === undefined ? '' : `Max-Age=${convertTime(v, 's').toString()}`,
  domain: (v: TCookieAttributes['domain']) =>
    v === undefined ? '' : `Domain=${sanitizeCookieAttrValue(String(v))}`,
  path: (v: TCookieAttributes['path']) =>
    v === undefined ? '' : `Path=${sanitizeCookieAttrValue(String(v))}`,
  secure: (v: TCookieAttributes['secure']) => (v ? 'Secure' : ''),
  httpOnly: (v: TCookieAttributes['httpOnly']) => (v ? 'HttpOnly' : ''),
  sameSite: (v: TCookieAttributes['sameSite']) =>
    v ? `SameSite=${typeof v === 'string' ? v : 'Strict'}` : '',
}
