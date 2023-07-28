import { useWFContext } from '../event-wf'

export function useWfState() {
    const { store } = useWFContext()
    const event = store('event')
    return {
        ctx: <T>() => event.get('inputContext') as T,
        input: <I>() => event.get('input') as I | undefined,
        schemaId: event.get('schemaId'),
        indexes: () => event.get('indexes'),
    }
}
