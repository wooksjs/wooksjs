import { EventContext } from '../index'
import type { Accessor, EventContextOptions } from '../index'

export class IsolatedContext extends EventContext {
  private _isolated: Set<number>
  constructor(opts: EventContextOptions, isolate: Array<Accessor<any>>) {
    super(opts)
    this._isolated = new Set(isolate.map(a => a._id))
  }
  protected _shouldTraverseParent(id: number): boolean {
    return !this._isolated.has(id)
  }
}
