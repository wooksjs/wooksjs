import { useCliContext } from '../event-cli'

export function useRootCmd() {
    const { store } = useCliContext()
    return store('rootCmd').value
}
