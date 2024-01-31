export interface TWFEventData {
  schemaId: string
  inputContext: unknown
  indexes?: number[]
  input?: unknown
  type: 'WF'
}

export interface TWFContextStore {
  resume: boolean
}
