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
      return { error: 'Invalid or expired workflow state', status: 400 }
    }

    if (state.schemaId !== (wfid ?? '')) {
      const realStrategy = resolveStrategy(state.schemaId)
      ctx.set(stateStrategyKey, realStrategy)
    }

    output = await deps.resume(state, { input, eventContext: ctx })
  } else if (wfid) {
    // --- START ---
    if (config.allow?.length && !config.allow.includes(wfid)) {
      return { error: `Workflow '${wfid}' is not allowed`, status: 403 }
    }
    if (config.block?.includes(wfid)) {
      return { error: `Workflow '${wfid}' is blocked`, status: 403 }
    }
    const strategy = resolveStrategy(wfid)
    ctx.set(stateStrategyKey, strategy)
    const initialContext = config.initialContext ? config.initialContext(body, wfid) : {}
    output = await deps.start(wfid, initialContext, { input, eventContext: ctx })
  } else {
    return { error: 'Missing wfs (state token) or wfid (workflow ID)', status: 400 }
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
      response.setHeader('location', finished.value as string)
      return { status: finished.status ?? 302 }
    }
    if (finished) {
      return finished.value
    }
    return { finished: true }
  }

  if (output.inputRequired) {
    const outletReq = output.inputRequired as WfOutletRequest
    const outletHandler = registry.get(outletReq.outlet)
    if (!outletHandler) {
      return { error: `Unknown outlet: '${outletReq.outlet}'`, status: 500 }
    }

    const strategy = ctx.get(stateStrategyKey)!
    const stateWithMeta: WfState = {
      ...(output.state as WfState),
      meta: { outlet: outletReq.outlet },
    }
    const newToken = await strategy.persist(
      stateWithMeta,
      output.expires ? { ttl: output.expires - Date.now() } : undefined,
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
