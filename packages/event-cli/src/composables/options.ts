import minimist from 'minimist'
import { useCliContext } from '../event-cli'
import { useCliHelp } from './cli-help'

/**
 * Get CLI Options
 * 
 * @returns an object with CLI options
 */
export function useCliOptions() {
    const { store } = useCliContext()
    const flags = store('flags')
    if (!flags.value) {
        const event = store('event')
        flags.value = minimist(event.value.argv, event.get('opts'))
    }
    return flags.value
}

/**
 * Getter for Cli Option value
 * 
 * @param name name of the option
 * @returns value of a CLI option
 */
export function useCliOption(name: string) {
    try {
        const options = useCliHelp().getEntry()?.options || []
        const opt = options.find(o => o.keys.includes(name))
        if (opt) {
            for (const key of opt.keys) {
                if (useCliOptions()[key]) {
                    return useCliOptions()[key]
                }
            }
        }
    } catch (e) {
        //
    }
    return useCliOptions()[name]
}
