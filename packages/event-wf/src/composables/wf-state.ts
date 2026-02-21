import { useWFContext } from '../event-wf'

/**
 * Composable that provides access to the current workflow execution state.
 * @example
 * ```ts
 * const { ctx, input, schemaId, stepId } = useWfState()
 * const context = ctx<MyContext>()
 * const stepInput = input<MyInput>()
 * ```
 */
export function useWfState() {
  const { store, getCtx } = useWFContext()
  const event = store('event')
  return {
    ctx: <T>() => event.get('inputContext') as T,
    input: <I>() => event.get('input') as I | undefined,
    schemaId: event.get('schemaId'),
    stepId: () => event.get('stepId'),
    indexes: () => event.get('indexes'),
    resume: getCtx().resume,
  }
}
