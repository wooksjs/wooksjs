import type { WfOutletRequest, WfState, WfStateStrategy } from '@prostojs/wf/outlets'
import { current } from '@wooksjs/event-core'
import { useCookies, useResponse, useUrlParams } from '@wooksjs/event-http'
import { useBody } from '@wooksjs/http-body'

import {
  outletsRegistryKey,
  stateStrategyKey,
  stateStrategyNameKey,
  strategyRegistryKey,
  wfFinishedKey,
} from './outlet-context'
import type { WfOutletTriggerConfig, WfOutletTriggerDeps } from './types'

const STRATEGY_NAME_RE = /^[A-Za-z0-9_-]+$/

function wrapToken(name: string, raw: string): string {
  return `${name}.${raw}`
}

function unwrapToken(token: string): { name: string; raw: string } | null {
  const i = token.indexOf('.')
  if (i <= 0 || i === token.length - 1) { return null }
  return { name: token.slice(0, i), raw: token.slice(i + 1) }
}

function normalizeStateConfig(state: WfOutletTriggerConfig['state']): {
  registry: Record<string, WfStateStrategy>
  resolveDefaultName: (wfid: string) => string
} {
  if (typeof state === 'object' && state !== null && 'strategies' in state) {
    const registry = state.strategies
    for (const name of Object.keys(registry)) {
      if (!STRATEGY_NAME_RE.test(name)) {
        throw new Error(
          `Invalid strategy name '${name}': must match /^[A-Za-z0-9_-]+$/`,
        )
      }
    }
    const def = state.default
    const resolveDefaultName =
      typeof def === 'function' ? def : (_wfid: string) => def
    return { registry, resolveDefaultName }
  }
  // Single-strategy shortcut → auto-promote to { default: state }
  return {
    registry: { default: state },
    resolveDefaultName: () => 'default',
  }
}

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
  const registry = new Map(config.outlets.map(o => [o.name, o]))
  ctx.set(outletsRegistryKey, registry)
  ctx.set(wfFinishedKey, undefined)

  const { registry: strategyRegistry, resolveDefaultName } = normalizeStateConfig(
    config.state,
  )
  ctx.set(strategyRegistryKey, strategyRegistry)

  const { parseBody } = useBody()
  const { params } = useUrlParams()
  const { getCookie } = useCookies()
  const response = useResponse()
  const body = await parseBody<Record<string, unknown>>().catch(() => undefined)

  const queryParams = params()

  let token: string | undefined
  for (const source of tokenRead) {
    if (source === 'body') {
      token = body?.[tokenName] as string | undefined
    } else if (source === 'query') {
      token = queryParams.get(tokenName) ?? undefined
    } else if (source === 'cookie') {
      token = getCookie(tokenName) ?? undefined
    }
    if (token) { break }
  }

  const wfid =
    (body?.[wfidName] as string | undefined) ?? queryParams.get(wfidName) ?? undefined
  const input = body?.input

  let output
  let incomingName: string | undefined
  let incomingRaw: string | undefined

  if (token) {
    // --- RESUME ---
    const unwrapped = unwrapToken(token)
    if (!unwrapped) {
      response.setStatus(410)
      return { error: 'Invalid workflow state token' }
    }
    // hasOwn guard prevents prototype keys (e.g. 'constructor') from
    // resolving to inherited values and bypassing the 410.
    const strategy = Object.prototype.hasOwnProperty.call(strategyRegistry, unwrapped.name)
      ? strategyRegistry[unwrapped.name]
      : undefined
    if (!strategy) {
      // Do not leak which strategies are configured.
      response.setStatus(410)
      return { error: 'Invalid workflow state token' }
    }
    incomingName = unwrapped.name
    incomingRaw = unwrapped.raw
    ctx.set(stateStrategyKey, strategy)
    ctx.set(stateStrategyNameKey, incomingName)

    const state = await strategy.consume(unwrapped.raw)
    if (!state) {
      response.setStatus(410)
      return { error: 'Invalid or expired workflow state' }
    }

    output = await deps.resume(state, { input, eventContext: ctx })
  } else if (wfid) {
    // --- START ---
    if (config.allow?.length && !config.allow.includes(wfid)) {
      response.setStatus(403)
      return { error: `Workflow '${wfid}' is not allowed` }
    }
    if (config.block?.includes(wfid)) {
      response.setStatus(403)
      return { error: `Workflow '${wfid}' is blocked` }
    }
    const defaultName = resolveDefaultName(wfid)
    const strategy = strategyRegistry[defaultName]
    if (!strategy) {
      throw new Error(
        `Default strategy '${defaultName}' not found in registry. Known: ${Object.keys(strategyRegistry).join(', ')}`,
      )
    }
    ctx.set(stateStrategyKey, strategy)
    ctx.set(stateStrategyNameKey, defaultName)
    const initialContext = config.initialContext ? config.initialContext(body, wfid) : {}
    output = await deps.start(wfid, initialContext, { input, eventContext: ctx })
  } else {
    response.setStatus(400)
    return { error: 'Missing wfs (state token) or wfid (workflow ID)' }
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
    const outletReq = output.inputRequired as WfOutletRequest
    const outletHandler = registry.get(outletReq.outlet)
    if (!outletHandler) {
      response.setStatus(500)
      return { error: `Unknown outlet: '${outletReq.outlet}'` }
    }

    const currentStrategy = ctx.get(stateStrategyKey)!
    const currentName = ctx.get(stateStrategyNameKey)!
    const stateWithMeta: WfState = {
      ...(output.state as WfState),
      meta: { outlet: outletReq.outlet },
    }
    // Reuse the incoming handle so the URL token stays valid across the
    // whole workflow (refresh / bookmark / lost-connection-then-resume).
    // Mint fresh on start (no incoming token) or after a strategy swap —
    // the incoming raw handle belongs to a different keyspace.
    const sameStrategy = incomingName !== undefined && incomingName === currentName
    const reuseHandle =
      sameStrategy && incomingRaw !== undefined ? { handle: incomingRaw } : undefined
    const newRaw = await currentStrategy.persist(
      stateWithMeta,
      output.expires ? { ttl: output.expires - Date.now() } : undefined,
      reuseHandle,
    )
    const newToken = wrapToken(currentName, newRaw)

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
