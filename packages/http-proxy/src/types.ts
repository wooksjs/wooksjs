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
