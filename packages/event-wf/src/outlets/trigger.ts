import type { TFlowOutput } from '@prostojs/wf'
import type { WfState, WfStateStrategy } from '@prostojs/wf/outlets'
import { current } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'
import { useCookies, useResponse, useUrlParams } from '@wooksjs/event-http'
import { useBody } from '@wooksjs/http-body'

import type { WfPauseRequest } from '../pause-request'

import { createWfAccess, hasAccessLists } from './access'
import { wfTriggerError } from './errors'
import type { WfRefusal } from './errors'
import { outletsRegistryKey, wfFinishedKey } from './outlet-context'
import { consumeWithExpiry, restoreConsumedState, restoreCount, snapshotState } from './restore'
import {
  defaultStrategy,
  normalizeStateConfig,
  pauseMeta,
  pauseStrategy,
  strategyByName,
  unwrapToken,
  wrapToken,
} from './state-config'
import type { WfOutletTriggerConfig, WfOutletTriggerDeps } from './types'

const EXPIRED: WfRefusal = { code: 'WF_EXPIRED' }

/** What a request asked for, read before anything touches state. */
interface TriggerRequest {
  ctx: EventContext
  body: Record<string, unknown> | undefined
  token: unknown
  wfid: unknown
  input: unknown
  tokenName: string
  tokenWrite: 'body' | 'cookie'
  /** The state token to set as a cookie — only once the whole request has succeeded. */
  cookieToken?: string
}

/**
 * Handle an HTTP request that starts or resumes a workflow.
 *
 * Reads wfs (state token) and wfid (workflow ID) from request body, query params,
 * or cookies — configurable via `config.token`. On workflow pause, persists state
 * and dispatches to the named outlet. On finish, returns the finished response.
 *
 * A refused request is **thrown** as an `HttpError` with a `code` (see `WF_TRIGGER_ERRORS`):
 * `WF_MISSING`/`WF_INVALID` (400), `WF_FORBIDDEN` (403), `WF_NOT_FOUND` (404),
 * `WF_INVALID_TOKEN`/`WF_EXPIRED` (410), `WF_UNKNOWN_OUTLET` (500).
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
  const wfidName = config.wfidName ?? 'wfid'

  const ctx = current()
  ctx.set(outletsRegistryKey, new Map(config.outlets.map((o) => [o.name, o])))

  const { parseBody } = useBody()
  const { params } = useUrlParams()
  const { getCookie } = useCookies()
  const body = await parseBody<Record<string, unknown>>().catch(() => undefined)
  const queryParams = params()

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

  const request: TriggerRequest = {
    ctx,
    body,
    token,
    wfid: body?.[wfidName] ?? queryParams.get(wfidName) ?? undefined,
    input: body?.input,
    tokenName,
    tokenWrite: tok.write ?? 'body',
  }
  // Everything that reads or writes state, or delivers, runs inside `around`.
  const run = () => runTrigger(config, deps, request)
  const value = await (config.around ? config.around(run) : run())
  // Only now, with nothing left that can fail, hand out the token the request made live
  if (request.cookieToken !== undefined) {
    useResponse().setCookie(tokenName, request.cookieToken, {
      httpOnly: true,
      sameSite: 'Strict',
      path: '/',
    })
  }
  return value
}

async function runTrigger(
  config: WfOutletTriggerConfig,
  deps: WfOutletTriggerDeps,
  request: TriggerRequest,
): Promise<unknown> {
  const { ctx, body, token, wfid, input, tokenName, tokenWrite } = request
  // Each run starts over (`around` may retry it): nothing from a previous run carries over
  request.cookieToken = undefined
  ctx.set(wfFinishedKey, undefined)
  const stateConfig = normalizeStateConfig(config.state)
  const strategyRegistry = stateConfig.registry
  const response = useResponse()
  const listsSet = hasAccessLists(config)

  /**
   * The resumed token: its strategy `name` and `raw` handle, the `restores` already spent on
   * that handle (restoreOnError; carried while it is re-used) and the consumed state's `meta`
   * (its caller part is carried to the next pause).
   */
  let incoming:
    | { name: string; raw: string; restores: number; meta: Record<string, unknown> | undefined }
    | undefined
  /** What this request persisted — `sameHandle`: under the incoming handle the client holds. */
  let persisted: { strategy: WfStateStrategy; raw: string; sameHandle: boolean } | undefined

  /** Set once an OUT-OF-BAND delivery succeeded: the new token left the server. */
  let committed = false

  /**
   * Cleanup on failure (not committed): a state this request persisted under a NEW handle never
   * reached the client — discard it. If that cannot be proven (`consume` throws, or `retrieve`
   * still finds it — a strategy whose `consume` is a no-op, like EncapsulatedStateStrategy),
   * it is logged and left behind, unreachable: the client's own token stays the continuation.
   */
  const discardNewState = async (): Promise<void> => {
    if (!persisted || persisted.sameHandle) {
      return
    }
    try {
      await persisted.strategy.consume(persisted.raw)
      if (!(await persisted.strategy.retrieve(persisted.raw))) {
        return
      }
      ctx.logger.error(
        'wf trigger: the state persisted by a failed request could not be discarded (its strategy does not invalidate tokens) — left behind, unreachable',
      )
    } catch (discardError) {
      ctx.logger.error(
        `wf trigger: failed to discard the state persisted by a failed request (${(discardError as Error).message}) — left behind, unreachable`,
      )
    }
  }

  if (token) {
    // --- RESUME ---
    const unwrapped = typeof token === 'string' ? unwrapToken(token) : null
    const strategy = unwrapped ? strategyByName(strategyRegistry, unwrapped.name) : undefined
    if (!unwrapped || !strategy) {
      // Do not leak which strategies are configured.
      throw wfTriggerError({ code: 'WF_INVALID_TOKEN' })
    }
    // Gate a state on allow/block (when lists are set).
    const access = listsSet ? await createWfAccess(config, deps, ctx) : undefined
    const gate = (candidate: WfState | null): WfRefusal | undefined =>
      !candidate || typeof candidate.schemaId !== 'string'
        ? EXPIRED
        : access?.resume(candidate.schemaId)

    // Gate BEFORE consuming: a token refused by this trigger (e.g. minted by
    // a public flow, replayed on a protected trigger) must stay usable on the
    // trigger it belongs to.
    if (access) {
      const peekRefusal = gate(await strategy.retrieve(unwrapped.raw))
      if (peekRefusal) {
        throw wfTriggerError(peekRefusal)
      }
    }
    const consumed = await consumeWithExpiry(strategy, unwrapped.raw)
    // Re-check what was actually consumed — the handle may have been
    // re-persisted between retrieve() and consume().
    const refusal = gate(consumed.state)
    if (refusal) {
      throw wfTriggerError(refusal)
    }
    const state = consumed.state as WfState

    incoming = {
      name: unwrapped.name,
      raw: unwrapped.raw,
      restores: restoreCount(state),
      meta: state.meta,
    }
    // restoreOnError: snapshot the state as consumed, before the step can
    // mutate its context in place.
    const snapshot = config.restoreOnError ? snapshotState(state) : undefined
    // From here on the token is spent: ANY failure (the step, beforePersist, an unknown
    // strategy/outlet, persist, delivery, rendering, onFinished) restores it under restoreOnError.
    // Exactly one continuation survives a failure: the new state when it went under the
    // client's own handle; otherwise the restored old one (restoreOnError) or none.
    try {
      const output = await deps.resume(state, {
        input,
        eventContext: ctx,
        strategy: { name: unwrapped.name },
      })
      return await settle(output)
    } catch (error) {
      // Delivered out of band: that token is the continuation — never discard or restore.
      // Not delivered out of band: the client still holds the old token — clean up the new
      // state and restore the old one (the one reachable continuation).
      if (!committed) {
        await discardNewState()
        if (snapshot && !persisted?.sameHandle) {
          await restoreConsumedState(config, strategy, unwrapped.raw, snapshot, consumed, error)
        }
      }
      throw error
    }
  } else if (wfid !== undefined && wfid !== '') {
    // --- START ---
    if (typeof wfid !== 'string') {
      throw wfTriggerError({ code: 'WF_INVALID' })
    }
    // Judge the flow the router will actually run (flowOf), not the caller's
    // spelling — the same identity a resume is judged on. See access.ts.
    // Resolution is needed only for the lists or for callbacks that read it.
    let flowId = wfid
    let resolvedId: string | undefined
    if (listsSet || stateConfig.defaultUsesFlowId || config.initialContext) {
      const judged = await (await createWfAccess(config, deps, ctx)).start(wfid)
      if (judged.refusal) {
        throw wfTriggerError(judged.refusal)
      }
      flowId = judged.flowId
      resolvedId = judged.resolvedId
    }
    const defaultName = defaultStrategy(stateConfig, wfid, flowId)
    const initialContext = config.initialContext ? config.initialContext(body, wfid, flowId) : {}
    const output = await deps.start(wfid, initialContext, {
      input,
      eventContext: ctx,
      strategy: { name: defaultName },
      // With lists set, run only the flow that was judged. Without lists the
      // resolution only fed the callbacks, so a non-deterministic onNotFound
      // (e.g. A/B routing) keeps choosing freely.
      expectSchemaId: listsSet ? resolvedId : undefined,
    })
    try {
      return await settle(output)
    } catch (error) {
      if (!committed) {
        await discardNewState()
      }
      throw error
    }
  }
  throw wfTriggerError({ code: 'WF_MISSING' })

  /** Answers a finished or paused run: persist + deliver on pause, the finished value on finish. */
  async function settle(output: TFlowOutput<unknown, unknown, WfPauseRequest>): Promise<unknown> {
    const render = config.renderEnvelope
    if (output.finished) {
      const schemaId = output.state.schemaId
      const finishedInfo = { phase: 'finished' as const, schemaId, context: output.state.context }
      if (config.onFinished) {
        const value = await config.onFinished({ context: output.state.context, schemaId })
        return render ? render(value, finishedInfo) : value
      }

      const finished = ctx.get(wfFinishedKey)
      if (finished?.cookies) {
        for (const [name, cookie] of Object.entries(finished.cookies)) {
          response.setCookie(name, cookie.value, cookie.options as never)
        }
      }
      if (finished?.type === 'redirect') {
        response.setStatus(finished.status ?? 302)
        response.setHeader('location', finished.value as string)
        return ''
      }
      if (finished?.status) {
        response.setStatus(finished.status)
      }
      const value = finished ? finished.value : { finished: true }
      return render ? render(value, finishedInfo) : value
    }

    if (output.inputRequired) {
      const outletReq = output.inputRequired
      const outletHandler = ctx.get(outletsRegistryKey).get(outletReq.outlet)
      if (!outletHandler) {
        throw wfTriggerError({
          code: 'WF_UNKNOWN_OUTLET',
          message: `Unknown outlet: '${outletReq.outlet}'`,
          params: { outlet: outletReq.outlet },
        })
      }

      // The adapter augments `output.inputRequired.stateStrategy` with the
      // post-swap name on every pause (a missing or unknown name throws).
      const { name: finalName, strategy: finalStrategy } = pauseStrategy(
        strategyRegistry,
        outletReq,
      )

      // Reuse the incoming handle so the URL token stays valid across the
      // whole workflow (refresh / bookmark / lost-connection-then-resume).
      // Mint fresh on start (no incoming token) or after a strategy swap —
      // the incoming raw handle belongs to a different keyspace.
      const reuseHandle = incoming?.name === finalName ? { handle: incoming.raw } : undefined
      // Clamp: an expiry already past by save time must persist as "expired
      // now" — a zero/negative ttl reads as "no expiry" to the state strategies.
      const ttl = output.expires ? Math.max(1, output.expires - Date.now()) : undefined
      // restoreOnError: the restore count stays with the handle while it is re-used.
      const restores = config.restoreOnError && reuseHandle ? (incoming?.restores ?? 0) : 0
      const stateWithMeta: WfState = {
        ...(output.state as WfState),
        meta: pauseMeta(outletReq.outlet, restores, incoming?.meta),
      }
      if (config.beforePersist) {
        await config.beforePersist(stateWithMeta, outletReq)
      }
      const newRaw = await finalStrategy.persist(
        stateWithMeta,
        ttl === undefined ? undefined : { ttl },
        reuseHandle,
      )
      persisted = {
        strategy: finalStrategy,
        raw: newRaw,
        sameHandle: reuseHandle !== undefined && newRaw === reuseHandle.handle,
      }
      const newToken = wrapToken(finalName, newRaw)

      const outOfBand = outletHandler.tokenDelivery === 'out-of-band'

      const result = await outletHandler.deliver(outletReq, newToken)
      // The token has left the server (email, SMS…): this request is committed from here on.
      committed = outOfBand
      const delivered = result?.response
      let envelope: unknown = delivered ?? { waiting: true }
      if (render) {
        envelope = await render(envelope, {
          phase: 'paused',
          outlet: outletReq.outlet,
          schemaId: output.state.schemaId,
          context: output.state.context,
        })
      }

      if (tokenWrite === 'cookie' && !outOfBand) {
        request.cookieToken = newToken
      }

      // The token rides in the body only when the outlet answered with an object
      if (
        tokenWrite === 'body' &&
        !outOfBand &&
        delivered &&
        typeof delivered === 'object' &&
        envelope &&
        typeof envelope === 'object'
      ) {
        return { ...(envelope as Record<string, unknown>), [tokenName]: newToken }
      }

      return envelope
    }

    if (output.error) {
      return { error: output.error.message, errorList: output.errorList }
    }

    return { error: 'Unexpected workflow state' }
  }
}
