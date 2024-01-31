export interface TWooksProxyControls {
  overwrite?: Record<string, string> | ((data: Record<string, string>) => Record<string, string>)
  allow?: Array<string | RegExp> | '*'
  block?: Array<string | RegExp> | '*'
}

export interface TWooksProxyOptions {
  method?: string
  reqHeaders?: TWooksProxyControls
  reqCookies?: TWooksProxyControls
  resHeaders?: TWooksProxyControls
  resCookies?: TWooksProxyControls
  debug?: boolean
}
