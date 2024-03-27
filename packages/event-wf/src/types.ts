export interface TWFEventData {
  schemaId: string
  stepId: string | null
  inputContext: unknown
  indexes?: number[]
  input?: unknown
  type: 'WF'
}

export interface TWFContextStore {
  resume: boolean
}
