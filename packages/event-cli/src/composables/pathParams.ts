import { useCliContext } from '../event-cli'

export function usePathParams() {
    const { store } = useCliContext()
    const event = store('event')
    return event.get('pathParams')
}
