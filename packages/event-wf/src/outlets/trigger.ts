import type { WfState, WfStateStrategy } from '@prostojs/wf/outlets'
import { current } from '@wooksjs/event-core'
import { useCookies, useResponse, useUrlParams } from '@wooksjs/event-http'
import { useBody } from '@wooksjs/http-body'

import type { WfPauseRequest } from '../pause-request'
import { STRATEGY_NAME_RE } from '../strategy-context'

import { createWfAccess, hasAccessLists } from './access'
import { outletsRegistryKey, wfFinishedKey } from './outlet-context'
import { consumeWithExpiry, restoreConsumedState, restoreCount, snapshotState } from './restore'
import type { WfOutletTriggerConfig, WfOutletTriggerDeps } from './types'

function wrapToken(name: string, raw: string): string {
  return `${name}.${raw}`
}

function unwrapToken(token: string): { name: string; raw: string } | null {
  const i = token.indexOf('.')
  if (i <= 0 || i === token.length - 1) {
    return null
  }
  return { name: token.slice(0, i), raw: token.slice(i + 1) }
}

function normalizeStateConfig(state: WfOutletTriggerConfig['state']): {
  registry: Record<string, WfStateStrategy>
  resolveDefaultName: (wfid: string, flowId: string) => string
  /** whether the default-strategy picker reads the flow id */
  defaultUsesFlowId: boolean
} {
  if (typeof state === 'object' && state !== null && 'strategies' in state) {
    const registry = state.strategies
    for (const name of Object.keys(registry)) {
      if (!STRATEGY_NAME_RE.test(name)) {
        throw new Error(`Invalid strategy name '${name}': must match /^[A-Za-z0-9_-]+$/`)
      }
    }
    const def = state.default
    if (typeof def === 'function') {
      return { registry, resolveDefaultName: def, defaultUsesFlowId: true }
    }
    return { registry, resolveDefaultName: () => def, defaultUsesFlowId: false }
  }
  // Single-strategy shortcut → auto-promote to { default: state }
  return {
    registry: { default: state },
    resolveDefaultName: () => 'default',
    defaultUsesFlowId: false,
  }
}

/** A refused request: HTTP status + body. */
interface Refusal {
  status: number
  error: string
}

const EXPIRED: Refusal = { status: 410, error: 'Invalid or expired workflow state' }
const INVALID_TOKEN: Refusal = { status: 410, error: 'Invalid workflow state token' }

/**
 * Handle an HTTP request that starts or resumes a workflow.
 *
 * Reads wfs (state token) and wfid (workflow ID) from request body, query params,
 * or cookies — configurable via `config.token`. On workflow pause, persists state
 * and dispatches to the named outlet. On finish, returns the finished response.
 *
 * @example
 * ```ts
 * // In a wooks HTTP handler:
 * app.post('/workflow', () => handleWfOutletRequest(config, deps))
 *
 * // Better — use createOutletHandler():
 * const handle = createOutletHandler(wfApp)
 * app.post('/workflow', () => handle(config))
 * ```
 */
export async function handleWfOutletRequest(
  config: WfOutletTriggerConfig,
  deps: WfOutletTriggerDeps,
): Promise<unknown> {
  const tok = config.token ?? {}
  const tokenName = tok.name ?? 'wfs'
  const tokenRead = tok.read ?? ['body', 'query', 'cookie']
  const tokenWrite = tok.write ?? 'body'
  const wfidName = config.wfidName ?? 'wfid'

  const ctx = current()
  const registry = new Map(config.outlets.map((o) => [o.name, o]))
  ctx.set(outletsRegistryKey, registry)
  ctx.set(wfFinishedKey, undefined)

  const {
    registry: strategyRegistry,
    resolveDefaultName,
    defaultUsesFlowId,
  } = normalizeStateConfig(config.state)

  const { parseBody } = useBody()
  const { params } = useUrlParams()
  const { getCookie } = useCookies()
  const response = useResponse()
  const body = await parseBody<Record<string, unknown>>().catch(() => undefined)

  const queryParams = params()
  const refuse = (refusal: Refusal) => {
    response.setStatus(refusal.status)
    return { error: refusal.error }
  }

  // Body values are untrusted JSON — they may be arrays/objects, not strings.
  let token: unknown
  for (const source of tokenRead) {
    if (source === 'body') {
      token = body?.[tokenName]
    } else if (source === 'query') {
      token = queryParams.get(tokenName) ?? undefined
    } else if (source === 'cookie') {
      token = getCookie(tokenName) ?? undefined
    }
    if (token) {
      break
    }
  }

  const wfid: unknown = body?.[wfidName] ?? queryParams.get(wfidName) ?? undefined
  const input = body?.input
  const listsSet = hasAccessLists(config)

  let output
  let incomingName: string | undefined
  let incomingRaw: string | undefined
  /** restoreOnError: restores already spent on the incoming handle (carried while it is re-used). */
  let incomingRestores = 0

  if (token) {
    // --- RESUME ---
    const unwrapped = typeof token === 'string' ? unwrapToken(token) : null
    // hasOwn guard prevents prototype keys (e.g. 'constructor') from
    // resolving to inherited values and bypassing the 410.
    const strategy =
      unwrapped && Object.prototype.hasOwnProperty.call(strategyRegistry, unwrapped.name)
        ? strategyRegistry[unwrapped.name]
        : undefined
    if (!unwrapped || !strategy) {
      // Do not leak which strategies are configured.
      return refuse(INVALID_TOKEN)
    }
    incomingName = unwrapped.name
    incomingRaw = unwrapped.raw

    // Gate a state on allow/block (when lists are set).
    const access = listsSet ? await createWfAccess(config, deps, ctx) : undefined
    const gate = (candidate: WfState | null): Refusal | undefined =>
      !candidate || typeof candidate.schemaId !== 'string'
        ? EXPIRED
        : access?.resume(candidate.schemaId)

    // Gate BEFORE consuming: a token refused by this trigger (e.g. minted by
    // a public flow, replayed on a protected trigger) must stay usable on the
    // trigger it belongs to.
    if (access) {
      const peekRefusal = gate(await strategy.retrieve(unwrapped.raw))
      if (peekRefusal) {
        return refuse(peekRefusal)
      }
    }
    const consumed = await consumeWithExpiry(strategy, unwrapped.raw)
    // Re-check what was actually consumed — the handle may have been
    // re-persisted between retrieve() and consume().
    const refusal = gate(consumed.state)
    if (refusal) {
      return refuse(refusal)
    }
    const state = consumed.state as WfState

    // restoreOnError: snapshot the state as consumed, before the step can
    // mutate its context in place.
    incomingRestores = restoreCount(state)
    const snapshot = config.restoreOnError ? snapshotState(state) : undefined
    try {
      output = await deps.resume(state, {
        input,
        eventContext: ctx,
        strategy: { name: incomingName },
      })
    } catch (error) {
      if (snapshot) {
        await restoreConsumedState(config, strategy, unwrapped.raw, snapshot, consumed, error)
      }
      throw error
    }
  } else if (wfid !== undefined && wfid !== '') {
    // --- START ---
    if (typeof wfid !== 'string') {
      return refuse({ status: 400, error: 'Invalid workflow ID' })
    }
    // Judge the flow the router will actually run (flowOf), not the caller's
    // spelling — the same identity a resume is judged on. See access.ts.
    // Resolution is needed only for the lists or for callbacks that read it.
    let flowId = wfid
    let resolvedId: string | undefined
    if (listsSet || defaultUsesFlowId || config.initialContext) {
      const judged = await (await createWfAccess(config, deps, ctx)).start(wfid)
      if (judged.refusal) {
        return refuse(judged.refusal)
      }
      flowId = judged.flowId
      resolvedId = judged.resolvedId
    }
    const defaultName = resolveDefaultName(wfid, flowId)
    // hasOwn guard mirrors the resume/pause-time lookups — a custom
    // resolveDefaultName that returns 'constructor' / '__proto__' must
    // surface as 'not found in registry', not as a confusing TypeError
    // from calling .persist() on an inherited prototype value.
    const startStrategy = Object.prototype.hasOwnProperty.call(strategyRegistry, defaultName)
      ? strategyRegistry[defaultName]
      : undefined
    if (!startStrategy) {
      throw new Error(
        `Default strategy '${defaultName}' not found in registry. Known: ${Object.keys(strategyRegistry).join(', ')}`,
      )
    }
    const initialContext = config.initialContext ? config.initialContext(body, wfid, flowId) : {}
    output = await deps.start(wfid, initialContext, {
      input,
      eventContext: ctx,
      strategy: { name: defaultName },
      // With lists set, run only the flow that was judged. Without lists the
      // resolution only fed the callbacks, so a non-deterministic onNotFound
      // (e.g. A/B routing) keeps choosing freely.
      expectSchemaId: listsSet ? resolvedId : undefined,
    })
  } else {
    return refuse({ status: 400, error: 'Missing wfs (state token) or wfid (workflow ID)' })
  }

  if (output.finished) {
    if (config.onFinished) {
      return config.onFinished({
        context: output.state.context,
        schemaId: output.state.schemaId,
      })
    }

    const finished = ctx.get(wfFinishedKey)
    if (finished?.cookies) {
      for (const [name, cookie] of Object.entries(finished.cookies)) {
        response.setCookie(name, cookie.value, cookie.options as any)
      }
    }
    if (finished?.type === 'redirect') {
      response.setStatus(finished.status ?? 302)
      response.setHeader('location', finished.value as string)
      return ''
    }
    if (finished) {
      if (finished.status) {
        response.setStatus(finished.status)
      }
      return finished.value
    }
    return { finished: true }
  }

  if (output.inputRequired) {
    const outletReq = output.inputRequired as WfPauseRequest
    const outletHandler = registry.get(outletReq.outlet)
    if (!outletHandler) {
      response.setStatus(500)
      return { error: `Unknown outlet: '${outletReq.outlet}'` }
    }

    // The adapter augments `output.inputRequired.stateStrategy` with the
    // post-swap name on every pause. Treat its absence as a bug — fall back
    // and we mask misconfigured deps / regressions silently.
    const finalName = outletReq.stateStrategy
    if (finalName === undefined) {
      throw new Error(
        'Workflow paused without `stateStrategy` on inputRequired — the WF adapter must augment the output with the active strategy name.',
      )
    }
    const finalStrategy = Object.prototype.hasOwnProperty.call(strategyRegistry, finalName)
      ? strategyRegistry[finalName]
      : undefined
    if (!finalStrategy) {
      throw new Error(
        `Workflow paused with unknown strategy '${finalName}' — step swapped to a name not in the trigger's registry. Known: ${Object.keys(strategyRegistry).join(', ')}`,
      )
    }

    // Reuse the incoming handle so the URL token stays valid across the
    // whole workflow (refresh / bookmark / lost-connection-then-resume).
    // Mint fresh on start (no incoming token) or after a strategy swap —
    // the incoming raw handle belongs to a different keyspace.
    const sameStrategy = incomingName !== undefined && incomingName === finalName
    const reuseHandle =
      sameStrategy && incomingRaw !== undefined ? { handle: incomingRaw } : undefined
    // Clamp: an expiry already past by save time must persist as "expired
    // now" — a zero/negative ttl reads as "no expiry" to the state strategies.
    const ttl = output.expires ? Math.max(1, output.expires - Date.now()) : undefined
    // restoreOnError: the restore count stays with the handle while it is re-used.
    const restores = config.restoreOnError && reuseHandle ? incomingRestores : 0
    const stateWithMeta: WfState = {
      ...(output.state as WfState),
      meta: restores > 0 ? { outlet: outletReq.outlet, restores } : { outlet: outletReq.outlet },
    }
    const newRaw = await finalStrategy.persist(
      stateWithMeta,
      ttl === undefined ? undefined : { ttl },
      reuseHandle,
    )
    const newToken = wrapToken(finalName, newRaw)

    const outOfBand = outletHandler.tokenDelivery === 'out-of-band'

    if (tokenWrite === 'cookie' && !outOfBand) {
      response.setCookie(tokenName, newToken, {
        httpOnly: true,
        sameSite: 'Strict',
        path: '/',
      })
    }

    const result = await outletHandler.deliver(outletReq, newToken)

    if (
      tokenWrite === 'body' &&
      !outOfBand &&
      result?.response &&
      typeof result.response === 'object'
    ) {
      return { ...(result.response as Record<string, unknown>), [tokenName]: newToken }
    }

    return result?.response ?? { waiting: true }
  }

  if (output.error) {
    return { error: output.error.message, errorList: output.errorList }
  }

  return { error: 'Unexpected workflow state' }
}
