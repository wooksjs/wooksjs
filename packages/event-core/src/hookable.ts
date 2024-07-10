/* eslint-disable @typescript-eslint/no-unsafe-argument */
type HookCallback = (...args: any[]) => any

export class Hookable {
  private hooks: Record<string, HookCallback[]> = {}

  /**
   * Registers a callback to a specific hook name.
   * @param name - The name of the hook.
   * @param cb - The callback to register.
   */
  hook(name: string, cb: HookCallback) {
    if (!this.hooks[name]) {
      this.hooks[name] = []
    }
    this.hooks[name].push(cb)
    return () => {
      this.unhook(name, cb)
    }
  }

  /**
   * Calls all callbacks registered to the specified hook name.
   * @param name - The name of the hook.
   * @param args - The arguments to pass to each callback.
   */
  callHook(name: string, ...args: any[]) {
    if (this.hooks[name]) {
      for (const cb of this.hooks[name]) {
        try {
          cb(...args)
        } catch (error) {
          console.error(`Error in hook ${name}:`, error)
        }
      }
    }
  }

  /**
   * Unregisters a specific callback from a hook name.
   * @param name - The name of the hook.
   * @param cb - The callback to unregister.
   */
  unhook(name: string, cb: HookCallback) {
    if (this.hooks[name]) {
      this.hooks[name] = this.hooks[name].filter(hookCb => hookCb !== cb)
    }
  }
}
