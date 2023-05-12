import { URLSearchParams } from 'url'

export class WooksURLSearchParams extends URLSearchParams {
    toJson<T = unknown>(): T {
        const json: Record<string, unknown> = {}
        for (const [key, value] of this.entries()) {
            if (isArrayParam(key)) {
                const a = (json[key] = (json[key] || []) as string[])
                a.push(value)
            } else {
                json[key] = value
            }
        }
        return json as T
    }
}

function isArrayParam(name: string) {
    return name.endsWith('[]')
}
