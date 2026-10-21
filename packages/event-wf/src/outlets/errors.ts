import { HttpError } from '@wooksjs/event-http'

/**
 * Every error the outlet trigger throws for a request it refuses: an `HttpError` with this
 * status and `code` (UPPER_SNAKE), an English `message` and `params` for translation.
 *
 * | code | status | when | params |
 * |---|---|---|---|
 * | `WF_MISSING` | 400 | neither a state token nor a workflow id was sent | — |
 * | `WF_INVALID` | 400 | the workflow id is not a string (or, without a resolver, holds `%`/`?` while lists are set) | — |
 * | `WF_INVALID_TOKEN` | 410 | the token is malformed or names no configured strategy | — |
 * | `WF_EXPIRED` | 410 | the token's state is gone: expired, already used, or never existed | — |
 * | `WF_FORBIDDEN` | 403 | `allow` / `block` refuses the flow (start or resume) | `reason: 'not-allowed' \| 'blocked'`, `wfid` (start only) |
 * | `WF_NOT_FOUND` | 404 | with `allow`/`block` set, the workflow id resolves to no flow | `wfid` |
 * | `WF_UNKNOWN_OUTLET` | 500 | a step paused on an outlet the trigger does not have | `outlet` |
 */
export const WF_TRIGGER_ERRORS = Object.freeze({
  WF_MISSING: { status: 400, message: 'Missing wfs (state token) or wfid (workflow ID)' },
  WF_INVALID: { status: 400, message: 'Invalid workflow ID' },
  WF_INVALID_TOKEN: { status: 410, message: 'Invalid workflow state token' },
  WF_EXPIRED: { status: 410, message: 'Invalid or expired workflow state' },
  WF_FORBIDDEN: { status: 403, message: 'Workflow is not allowed' },
  WF_NOT_FOUND: { status: 404, message: 'Workflow not found' },
  WF_UNKNOWN_OUTLET: { status: 500, message: 'Unknown outlet' },
} as const)

/** A code from {@link WF_TRIGGER_ERRORS}. */
export type WfTriggerErrorCode = keyof typeof WF_TRIGGER_ERRORS

/** Body of a trigger error: `HttpError` body with `code` and (where documented) `params`. */
export interface WfTriggerErrorBody {
  message: string
  code: WfTriggerErrorCode
  params?: Record<string, unknown>
}

/** A refusal decided by the trigger, thrown as {@link wfTriggerError}. */
export interface WfRefusal {
  code: WfTriggerErrorCode
  /** overrides the table's default message */
  message?: string
  params?: Record<string, unknown>
}

/** Builds the `HttpError` the trigger throws for `refusal`. */
export function wfTriggerError(refusal: WfRefusal): HttpError<WfTriggerErrorBody> {
  const { status, message } = WF_TRIGGER_ERRORS[refusal.code]
  const body: WfTriggerErrorBody = { message: refusal.message ?? message, code: refusal.code }
  if (refusal.params) {
    body.params = refusal.params
  }
  return new HttpError(status, body)
}
