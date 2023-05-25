import { TWooksHandler, Wooks, WooksAdapterBase } from 'wooks'
import { createCliContext } from './event-cli'
import { TConsoleBase } from '@prostojs/logger'
import { TEventOptions } from '@wooksjs/event-core'
import { CliHelpRenderer, TCliEntry, TCliHelpOptions } from '@prostojs/cli-help'
import { TCliHelpCustom, TCliHelpRenderer } from './types'

export const cliShortcuts = {
    cli: 'CLI',
}

export interface TWooksCliOptions {
    onError?(e: Error): void
    onNotFound?: TWooksHandler<unknown>
    onUnknownCommand?: (params: string[], raiseError: () => void) => unknown
    logger?: TConsoleBase
    eventOptions?: TEventOptions
    cliHelp?: TCliHelpRenderer | TCliHelpOptions
}

export interface TWooksCliEntry<T>
    extends Omit<TCliEntry<TWooksHandler<T>>, 'custom' | 'command'> {
    onRegister?: TCliHelpCustom['cb']
    handler: TWooksHandler<T>
}

export class WooksCli extends WooksAdapterBase {
    protected logger: TConsoleBase

    protected cliHelp: TCliHelpRenderer

    constructor(
        protected opts?: TWooksCliOptions,
        wooks?: Wooks | WooksAdapterBase
    ) {
        super(wooks, opts?.logger)
        this.logger = opts?.logger || this.getLogger('wooks-cli')
        this.cliHelp =
            opts?.cliHelp instanceof CliHelpRenderer
                ? opts.cliHelp
                : new CliHelpRenderer<TCliHelpCustom>(opts?.cliHelp)
    }

    /**
     * ### Register CLI Command
     * Command path segments may be separated by / or space.
     *
     * For example the folowing path are interpreted the same:
     * - "command test use:dev :name"
     * - "command/test/use:dev/:name"
     *
     * Where name will become an argument
     *
     * ```js
     * // example without options
     * app.cli('command/:arg', () => 'arg = ' + useRouteParams().params.arg )
     *
     * // example with options
     * app.cli('command/:arg', {
     *   description: 'Description of the command',
     *   options: [{ keys: ['project', 'p'], description: 'Description of the option', value: 'myProject' }],
     *   args: { arg: 'Description of the arg' },
     *   aliases: ['cmd'],  // alias "cmd/:arg" will be registered
     *   examples: [{
     *      description: 'Example of usage with someProject',
     *      cmd: 'argValue -p=someProject',
     *      // will result in help display:
     *      // "# Example of usage with someProject\n" +
     *      // "$ myCli command argValue -p=someProject\n"
     *   }],
     *   handler: () => 'arg = ' + useRouteParams().params.arg
     * })
     * ```
     *
     * @param path command path
     * @param _options handler or options
     *
     * @returns
     */
    public cli<
        ResType = unknown,
        ParamsType = Record<string, string | string[]>
    >(
        path: string,
        _options: TWooksCliEntry<ResType> | TWooksHandler<ResType>
    ) {
        const options: TWooksCliEntry<ResType> =
            typeof _options === 'function' ? { handler: _options } : _options
        const handler =
            typeof _options === 'function' ? _options : _options.handler
        const makePath = (s: string) => '/' + s.replace(/\s+/g, '/')

        // register handler
        const targetPath = makePath(path)
        const routed = this.on<ResType, ParamsType>('CLI', targetPath, handler)

        if (options.onRegister) {
            options.onRegister(targetPath, 0)
        }
        // register direct aliases
        for (const alias of options.aliases || []) {
            const vars = routed.getArgs().map((k) => ':' + k).join('/')
            const targetPath = makePath(alias) + (vars ? '/' + vars : '')
            this.on<ResType, ParamsType>('CLI', targetPath, handler)
            if (options.onRegister) {
                options.onRegister(targetPath, 1)
            }
        }

        // register helpCli entry
        const command = routed.getStaticPart().replace(/\//g, ' ').trim()
        const args: TWooksCliEntry<ResType>['args'] = {
            ...(options.args || {}),
        }
        for (const arg of routed.getArgs()) {
            if (!args[arg]) {
                args[arg] = ''
            }
        }
        this.cliHelp.addEntry({
            command,
            aliases: options.aliases?.map(alias => alias.replace(/\\:/g, ':')), // unescape ":" character
            args,
            description: options.description,
            examples: options.examples,
            options: options.options,
            custom: { handler: options.handler, cb: options.onRegister },
        })
        return routed
    }

    protected alreadyComputedAliases = false

    protected computeAliases() {
        if (!this.alreadyComputedAliases) {
            this.alreadyComputedAliases = true
            const aliases = this.cliHelp.getComputedAliases()
            for (const [alias, entry] of Object.entries(aliases)) {
                if (entry.custom) {
                    const vars = Object.keys(entry.args || {})
                        .map((k) => ':' + k)
                        .join('/')
                    const path =
                        '/' +
                        alias.replace(/\s+/g, '/').replace(/:/g, '\\:') +
                        (vars ? '/' + vars : '')
                    this.on('CLI', path, entry.custom.handler)
                    if (entry.custom.cb) {
                        entry.custom.cb(path, 3)
                    }
                }
            }
        }
    }

    /**
     * ## run
     * ### Start command processing
     * Triggers command processing
     *
     * By default takes `process.argv.slice(2)` as a command
     *
     * It's possible to replace the command by passing an argument
     *
     * @param _argv optionally overwrite `process.argv.slice(2)` with your `argv` array
     */
    async run(_argv?: string[]) {
        const argv = _argv || process.argv.slice(2)
        const pathParams = argv.filter(a => !a.startsWith('-'))
        const path =
            '/' +
            pathParams.map((v) => encodeURI(v).replace(/\//g, '%2F')).join('/')   
        const { restoreCtx, clearCtx, store } = createCliContext(
            { argv, pathParams, cliHelp: this.cliHelp, command: path.replace(/\//g, ' ').trim() },
            this.mergeEventOptions(this.opts?.eventOptions)
        )
        this.computeAliases()
        const { handlers: foundHandlers, firstStatic } = this.wooks.lookup('CLI', path)
        if (typeof firstStatic === 'string') {
            // overwriting command with firstStatic to properly search for help
            store('event').set('command', firstStatic.replace(/\//g, ' ').trim())
        }
        const handlers = foundHandlers ||
            (this.opts?.onNotFound && [this.opts.onNotFound]) ||
            null
        if (handlers) {
            try {
                for (const handler of handlers) {
                    restoreCtx()
                    const response = await handler()
                    if (typeof response === 'string') {
                        console.log(response)
                    } else if (Array.isArray(response)) {
                        response.forEach((r) =>
                            console.log(
                                typeof r === 'string'
                                    ? r
                                    : JSON.stringify(r, null, '  ')
                            )
                        )
                    } else if (response instanceof Error) {
                        this.onError(response)
                    } else if (response) {
                        if (response) {
                            console.log(JSON.stringify(response, null, '  '))
                        }
                    }
                }
            } catch (e) {
                this.onError(e as Error)
            }
            clearCtx()
        } else {
            this.onUnknownCommand(pathParams)
            clearCtx()
        }
    }

    protected onError(e: Error) {
        if (this.opts?.onError) {
            this.opts.onError(e)
        } else {
            this.error(e.message)
            process.exit(1)
        }
    }

    /**
     * Triggers `unknown command` processing and callbacks
     * @param pathParams `string[]` containing command
     */
    onUnknownCommand(pathParams: string[]) {
        const raiseError = () => {
            this.error(
                __DYE_RESET__ + 'Unknown command: ' + pathParams.join(' ')
            )
            process.exit(1)
        }
        if (this.opts?.onUnknownCommand) {
            this.opts.onUnknownCommand(pathParams, raiseError)
        } else {
            raiseError()
        }
    }

    protected error(e: string | Error) {
        if (typeof e === 'string') {
            console.error(__DYE_RED__ + 'ERROR: ' + __DYE_RESET__ + e)
        } else {
            console.error(__DYE_RED__ + 'ERROR: ' + __DYE_RESET__ + e.message)
        }
    }
}

/**
 * Factory for WooksCli App
 * @param opts TWooksCliOptions
 * @param wooks Wooks | WooksAdapterBase
 * @returns WooksHttp
 */
export function createCliApp(
    opts?: TWooksCliOptions,
    wooks?: Wooks | WooksAdapterBase
) {
    return new WooksCli(opts, wooks)
}
