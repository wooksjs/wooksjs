export function escapeRegex(s: string): string {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
}

function safeDecode(f: (s: string) => string, v: string): string {
    try {
        return f(v)
    } catch (e) {
        return v
    }
}

export function safeDecodeURIComponent(uri: string): string {
    if (uri.indexOf('%') < 0) return uri
    return safeDecode(decodeURIComponent, uri)
}
