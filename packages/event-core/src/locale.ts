import type { EventContext } from './context'
import { key } from './key'
import { current } from './storage'

/** A locale, or a lazy resolver for it (run on the first read, then kept). */
export type TLocaleInput = string | undefined | (() => string | undefined)

interface LocaleCell {
  value?: string
  resolve?: () => string | undefined
}

const localeKey = key<LocaleCell>('locale')

/**
 * The locale of the current event — for any event kind (HTTP, CLI, workflow, WebSocket).
 *
 * Wooks only carries the locale: it never translates. Your app decides how a request's locale
 * is chosen (for HTTP: `createHttpApp({ resolveLocale })`, typically with
 * `useAcceptLanguage().negotiate(...)`) and how text is translated (any i18n library).
 *
 * - `get()` — the nearest locale set on this event or a parent event (a workflow started from
 *   an HTTP request reads the request's locale), else `undefined`.
 * - `set(locale)` — sets it for this event and its child events; a parent never sees it.
 *   Pass a function to resolve lazily: it runs on the first `get()` (once), and the value is
 *   kept. `undefined` clears it for this event.
 *
 * @param ctx - Optional explicit context (defaults to `current()`)
 *
 * @example
 * ```ts
 * useLocale().set('de')
 * useLocale().set(() => useAcceptLanguage().negotiate(['en', 'de'], 'en')) // lazy
 * const locale = useLocale().get() // 'de' | 'en' | undefined
 * ```
 */
export function useLocale(ctx?: EventContext): {
  get: () => string | undefined
  set: (locale: TLocaleInput) => void
} {
  const c = ctx ?? current()
  return {
    get: () => readLocale(c),
    set: (locale) =>
      c.setOwn(localeKey, typeof locale === 'function' ? { resolve: locale } : { value: locale }),
  }
}

/**
 * @internal Sets a lazy locale resolver on `ctx` (as `useLocale(ctx).set(resolve)`, without
 * building the composable) — for adapters seeding their app policy on every event.
 */
export function setLocaleResolver(ctx: EventContext, resolve: () => string | undefined): void {
  ctx.setOwn(localeKey, { resolve })
}

function readLocale(ctx: EventContext): string | undefined {
  if (!ctx.has(localeKey)) {
    return undefined
  }
  const cell = ctx.get(localeKey)
  const resolve = cell.resolve
  if (resolve) {
    // Cleared while running: a resolver that reads the locale gets undefined, not a loop
    cell.resolve = undefined
    try {
      cell.value = resolve()
    } catch (error) {
      cell.resolve = resolve
      throw error
    }
  }
  return cell.value
}
