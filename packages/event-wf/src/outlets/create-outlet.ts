import type { WfOutlet, WfOutletRequest, WfOutletResult } from '@prostojs/wf/outlets'

/**
 * Creates an HTTP outlet that passes through the outlet payload as
 * the HTTP response body. This is the most common outlet — it returns
 * forms, prompts, or data to the client.
 *
 * @example
 * ```ts
 * const httpOutlet = createHttpOutlet()
 * // Step does: return outletHttp({ fields: ['email', 'password'] })
 * // Client receives: { fields: ['email', 'password'] }
 * ```
 */
export function createHttpOutlet(opts?: {
  /** Transform the payload before returning to client */
  transform?: (payload: unknown, context?: Record<string, unknown>) => unknown
}): WfOutlet {
  return {
    name: 'http',
    async deliver(request: WfOutletRequest, _token: string): Promise<WfOutletResult> {
      const body = opts?.transform
        ? opts.transform(request.payload, request.context)
        : typeof request.payload === 'object' && request.payload !== null
          ? { ...(request.payload as Record<string, unknown>), ...request.context }
          : request.payload
      return { response: body }
    },
  }
}

/**
 * Creates an email outlet that delegates to a user-provided send function.
 * The send function receives the target, template, context, and the state
 * token (for embedding in magic links / verification URLs).
 *
 * @example
 * ```ts
 * const emailOutlet = createEmailOutlet(async (opts) => {
 *   await mailer.send({
 *     to: opts.target,
 *     template: opts.template,
 *     data: { ...opts.context, verifyUrl: `/verify?wfs=${opts.token}` },
 *   })
 * })
 * ```
 */
export function createEmailOutlet(
  send: (opts: {
    target: string
    template: string
    context: Record<string, unknown>
    token: string
  }) => Promise<void>,
): WfOutlet {
  return {
    name: 'email',
    async deliver(request: WfOutletRequest, token: string): Promise<WfOutletResult> {
      await send({
        target: request.target ?? '',
        template: request.template ?? '',
        context: request.context ?? {},
        token,
      })
      return { response: { sent: true, outlet: 'email' } }
    },
  }
}
