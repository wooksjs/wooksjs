import minimist from 'minimist'
import { useCliContext } from '../event-cli'
import { useCliHelp } from './cli-help'

export function useFlags() {
    const { store } = useCliContext()
    const flags = store('flags')
    if (!flags.value) {
        flags.value = minimist(store('event').value.argv)
    }
    return flags.value
}

export function useFlag(name: string) {
    try {
        const options = useCliHelp().getEntry()?.options || []
        const opt = options.find(o => o.keys.includes(name))
        if (opt) {
            for (const key of opt.keys) {
                if (useFlags()[key]) {
                    return useFlags()[key]
                }
            }
        }
    } catch (e) {
        //
    }
    return useFlags()[name]
}
