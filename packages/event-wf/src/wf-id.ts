/**
 * Canonical form of a registered workflow id for comparisons: leading slashes
 * removed. Adapters differ only in that respect — some register flows as
 * `'auth/login'`, others as `'/auth/login'` — and the stored `state.schemaId`
 * keeps whichever form the flow was registered with.
 *
 * Use it to compare a stored `schemaId` with your own ids.
 *
 * @example
 * ```ts
 * normalizeWfId('/auth/login') // → 'auth/login'
 * normalizeWfId(state.schemaId) === normalizeWfId('auth/login')
 * ```
 */
export function normalizeWfId(id: string): string {
  return id.replace(/^\/+/u, '')
}

/** Router path of a workflow id (`'x'`, `'/x'`, `'//x'` → `'/x'`). */
export function flowPath(id: string): string {
  return `/${normalizeWfId(id)}`
}
