/** Event data describing a workflow execution instance. */
export interface TWFEventData {
  schemaId: string
  stepId: string | null
  inputContext: unknown
  indexes?: number[]
  input?: unknown
  type: 'WF'
}

/** Context store for workflow events, tracking resume state. */
export interface TWFContextStore {
  resume: boolean
}
