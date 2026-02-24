import { defineEventKind, key, slot } from '@wooksjs/event-core'

export const wfKind = defineEventKind('WF', {
  schemaId: slot<string>(),
  stepId: slot<string | null>(),
  inputContext: slot<unknown>(),
  indexes: slot<number[] | undefined>(),
  input: slot<unknown | undefined>(),
})

export const resumeKey = key<boolean>('wf.resume')
