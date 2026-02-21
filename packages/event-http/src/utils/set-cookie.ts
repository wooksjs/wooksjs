import type { TCookieAttributes, TSetCookieData } from '../types'
import { convertTime } from './time'

const COOKIE_NAME_RE = /^[\w!#$%&'*+\-.^`|~]+$/

function sanitizeCookieAttrValue(v: string): string {
  return v.replace(/[;\r\n]/g, '')
}

export function renderCookie(key: string, data: TSetCookieData) {
  if (!COOKIE_NAME_RE.test(key)) {
    throw new TypeError(`Invalid cookie name "${key}"`)
  }
  let attrs = ''
  for (const [a, v] of Object.entries(data.attrs)) {
    const func: (v: unknown) => string = cookieAttrFunc[a as keyof typeof cookieAttrFunc] as (
      v: unknown,
    ) => string
    if (typeof func === 'function') {
      const val = func(v)
      attrs += val ? `; ${val}` : ''
    } else {
      throw new TypeError(`Unknown Set-Cookie attribute ${a}`)
    }
  }
  return `${key}=${encodeURIComponent(data.value)}${attrs}`
}

const cookieAttrFunc = {
  expires: (v: TCookieAttributes['expires']) =>
    `Expires=${
      typeof v === 'string' || typeof v === 'number' ? new Date(v).toUTCString() : v.toUTCString()
    }`,
  maxAge: (v: TCookieAttributes['maxAge']) => `Max-Age=${convertTime(v, 's').toString()}`,
  domain: (v: TCookieAttributes['domain']) => `Domain=${sanitizeCookieAttrValue(String(v))}`,
  path: (v: TCookieAttributes['path']) => `Path=${sanitizeCookieAttrValue(String(v))}`,
  secure: (v: TCookieAttributes['secure']) => (v ? 'Secure' : ''),
  httpOnly: (v: TCookieAttributes['httpOnly']) => (v ? 'HttpOnly' : ''),
  sameSite: (v: TCookieAttributes['sameSite']) =>
    v ? `SameSite=${typeof v === 'string' ? v : 'Strict'}` : '',
}
