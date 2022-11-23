import minimist from 'minimist'
import { useCliContext } from '../event-cli'

export function useFlags() {
    const { store } = useCliContext()
    const flags = store('flags')
    if (!flags.value) {
        flags.value = minimist(store('event').value.argv)
    }
    return flags.value
}

export function useFlag(name: string) {
    return useFlags()[name]
}
