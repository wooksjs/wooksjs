import type { WfOutletRequest, WfState } from '@prostojs/wf/outlets'
import { current } from '@wooksjs/event-core'
import { useCookies, useResponse, useUrlParams } from '@wooksjs/event-http'
import { useBody } from '@wooksjs/http-body'

import {
  outletsRegistryKey,
  stateStrategyKey,
  wfFinishedKey,
} from './outlet-context'
import type { WfOutletTriggerConfig, WfOutletTriggerDeps } from './types'

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

  const resolveStrategy = (id: string) =>
    typeof config.state === 'function' ? config.state(id) : config.state

  let output
  // True when the resume path re-resolved the strategy because
  // state.schemaId disagreed with the request wfid. In that case the handle
  // belongs to the provisional strategy's keyspace, so we must not reuse it
  // against the real strategy.
  let strategyReResolved = false

  if (token) {
    // --- RESUME ---
    const strategy = resolveStrategy(wfid ?? '')
    ctx.set(stateStrategyKey, strategy)

    // Consume runs on the provisional strategy (resolved from request wfid).
    // If state.schemaId differs (per-wfid strategies, re-resolved below) and
    // storages don't overlap, the real strategy never sees consume — known
    // edge case documented on WfOutletTriggerConfig.state.
    const state = await strategy.consume(token)
    if (!state) {
      response.setStatus(410)
      return { error: 'Invalid or expired workflow state' }
    }

    if (state.schemaId !== (wfid ?? '')) {
      const realStrategy = resolveStrategy(state.schemaId)
      if (realStrategy !== strategy) {
        ctx.set(stateStrategyKey, realStrategy)
        strategyReResolved = true
      }
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
    const strategy = resolveStrategy(wfid)
    ctx.set(stateStrategyKey, strategy)
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

    const strategy = ctx.get(stateStrategyKey)!
    const stateWithMeta: WfState = {
      ...(output.state as WfState),
      meta: { outlet: outletReq.outlet },
    }
    // Reuse the incoming handle so the URL token stays valid across the
    // whole workflow (refresh / bookmark / lost-connection-then-resume).
    // Mint fresh on start (no incoming token) or when the strategy was
    // re-resolved (the incoming handle belongs to a different keyspace).
    const reuseHandle = token && !strategyReResolved ? { handle: token } : undefined
    const newToken = await strategy.persist(
      stateWithMeta,
      output.expires ? { ttl: output.expires - Date.now() } : undefined,
      reuseHandle,
    )

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
