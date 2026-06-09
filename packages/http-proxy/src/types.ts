/** Controls for filtering and transforming proxied headers or cookies. */
export interface TWooksProxyControls {
  /** Override specific key-value pairs, or provide a transform function. */
  overwrite?: Record<string, string> | ((data: Record<string, string>) => Record<string, string>)
  /** Allowlist of keys (strings or patterns) to forward; use `'*'` to allow all. */
  allow?: Array<string | RegExp> | '*'
  /** Blocklist of keys (strings or patterns) to suppress; use `'*'` to block all. */
  block?: Array<string | RegExp> | '*'
}

/** Options for configuring the proxy request, including header/cookie controls and debugging. */
export interface TWooksProxyOptions {
  /** Override the HTTP method used for the proxied request. */
  method?: string
  /**
   * Allowlist of upstream hostnames. When set, the resolved target host must match
   * one entry (string = case-insensitive exact match, RegExp = tested against the
   * hostname) or the request is rejected with `502`. Use this when the target is
   * built from request input. An empty array denies every host.
   */
  allowedHosts?: Array<string | RegExp>
  /** Controls for filtering/transforming outgoing request headers. */
  reqHeaders?: TWooksProxyControls
  /** Controls for filtering/transforming outgoing request cookies. */
  reqCookies?: TWooksProxyControls
  /** Controls for filtering/transforming incoming response headers. */
  resHeaders?: TWooksProxyControls
  /** Controls for filtering/transforming incoming response cookies. */
  resCookies?: TWooksProxyControls
  /** When true, logs proxy request and response details. */
  debug?: boolean
}
