import { useCliContext } from '../event-cli'
import { useCliOption } from './options'

/**
 * ## useCliHelp
 * ### Composable
 * ```js
 * // example of printing cli instructions
 * const { print } = useCliHelp()
 * // print with colors
 * print(true)
 * // print with no colors
 * // print(false)
 * ```
 * @returns
 */
export function useCliHelp() {
  const event = useCliContext().store('event')
  const getCliHelp = () => event.get('cliHelp')
  const getEntry = () => getCliHelp().match(event.get('command')).main
  return {
    getCliHelp,
    getEntry,
    render: (width?: number, withColors?: boolean) =>
      getCliHelp().render(event.get('command'), width, withColors),
    print: (withColors?: boolean) => {
      getCliHelp().print(event.get('command'), withColors)
    },
  }
}

/**
 * ## useAutoHelp
 * ### Composable
 *
 * Prints help if `--help` option provided.
 *
 * ```js
 *  // example of use: print help and exit
 *  app.cli('test', () => {
 *      useAutoHelp() && process.exit(0)
 *      return 'hit test command'
 *  })
 *
 *  // add option -h to print help, no colors
 *  app.cli('test/nocolors', () => {
 *      useAutoHelp(['help', 'h'], false) && process.exit(0)
 *      return 'hit test nocolors command'
 *  })
 * ```
 * @param keys default `['help']` - list of options to trigger help render
 * @param colors default `true`, prints with colors when true
 * @returns true when --help was provided. Otherwise returns false
 */
export function useAutoHelp(keys = ['help'], colors = true) {
  for (const option of keys) {
    if (useCliOption(option) === true) {
      // try {
      useCliHelp().print(colors)
      return true
      // } catch (e) {
      //     throw new
      // }
    }
  }
}

/**
 * ##useCommandLookupHelp
 * ### Composable
 *
 * Tries to find valid command based on provided command.
 *
 * If manages to find a valid command, throws an error
 * suggesting a list of valid commands
 *
 * Best to use in `onUnknownCommand` callback:
 *
 * ```js
 *  const app = createCliApp({
 *      onUnknownCommand: (path, raiseError) => {
 *          // will throw an error suggesting a list
 *          // of valid commands if could find some
 *          useCommandLookupHelp()
 *          // fallback to a regular error handler
 *          raiseError()
 *      },
 *  })
 * ```
 *
 * @param lookupDepth depth of search in backwards
 * @example
 *
 * For provided command `run test:drive dir`
 *  - lookup1: `run test:drive dir`  (deep = 0)
 *  - lookup2: `run test:drive`      (deep = 1)
 *  - lookup3: `run test`            (deep = 2)
 *  - lookup4: `run`                 (deep = 3)
 * ...
 */
export function useCommandLookupHelp(lookupDepth = 3) {
  const parts = useCliContext()
    .store('event')
    .get('pathParams')
    .flatMap(p => `${p} `.split(':').map((s, i) => (i ? `:${s}` : s)))
  const cliHelp = useCliHelp().getCliHelp()
  const cmd = cliHelp.getCliName()
  let data
  for (let i = 0; i < Math.min(parts.length, lookupDepth + 1); i++) {
    const pathParams = parts
      .slice(0, i ? -i : parts.length)
      .join('')
      .trim()
    try {
      data = cliHelp.match(pathParams)
      break
    } catch (error) {
      const variants = cliHelp.lookup(pathParams)
      if (variants.length > 0) {
        throw new Error(
          `Wrong command, did you mean:\n${variants
            .slice(0, 7)
            .map(c => `  $ ${cmd} ${c.main.command}`)
            .join('\n')}`
        )
      }
    }
  }
  if (data) {
    const { main, children } = data
    if (main.args && Object.keys(main.args).length > 0) {
      throw new Error(
        `Arguments expected: ${Object.keys(main.args)
          .map(l => `<${l}>`)
          .join(', ')}`
      )
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    } else if (children && children.length > 0) {
      throw new Error(
        `Wrong command, did you mean:\n${children
          .slice(0, 7)
          .map(c => `  $ ${cmd} ${c.command}`)
          .join('\n')}`
      )
    }
  }
}
