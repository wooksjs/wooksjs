/** Input data for creating a workflow event context. */
export interface TWFEventInput {
  schemaId: string
  stepId: string | null
  inputContext: unknown
  indexes?: number[]
  input?: unknown
}
