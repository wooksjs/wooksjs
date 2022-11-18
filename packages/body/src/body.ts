import { useHeaders, innerCacheSymbols, useRequest, EHttpStatusCode, WooksError, WooksURLSearchParams, useCacheStore } from '@wooksjs/composables'
import { panic } from 'common/panic'
import { compressors, TBodyCompressor, uncompressBody } from './utils/body-compressor'

type TBodyCache = { 
    parsed?: unknown
    isJson?: boolean
    isHtml?: boolean
    isText?: boolean
    isBinary?: boolean
    isXml?: boolean
    isFormData?: boolean
    isUrlencoded?: boolean
    isCompressed?: boolean
    contentEncodings?: string[]
}

export function useBody() {
    const { get, set, has } = useCacheStore<TBodyCache>(innerCacheSymbols.request)
    const { rawBody } = useRequest()
    const { 'content-type': contentType, 'content-encoding': contentEncoding } = useHeaders()

    function contentIs(type: string) {
        return (contentType || '').indexOf(type) >= 0
    }

    function isJson() {
        if (!has('isJson')) {
            return set('isJson', contentIs('application/json'))
        }
        return get('isJson')
    }

    function isHtml() {
        if (!has('isHtml')) {
            return set('isHtml', contentIs('text/html'))
        }
        return get('isHtml')
    }

    function isXml() {
        if (!has('isXml')) {
            return set('isXml', contentIs('text/xml'))
        }
        return get('isXml')
    }

    function isText() {
        if (!has('isText')) {
            return set('isText', contentIs('text/plain'))
        }
        return get('isText')
    }

    function isBinary() {
        if (!has('isBinary')) {
            return set('isBinary', contentIs('application/octet-stream'))
        }
        return get('isBinary')
    }

    function isFormData() {
        if (!has('isFormData')) {
            return set('isFormData', contentIs('multipart/form-data'))
        }
        return get('isFormData')
    }

    function isUrlencoded() {
        if (!has('isUrlencoded')) {
            return set('isUrlencoded', contentIs('application/x-www-form-urlencoded'))
        }
        return get('isUrlencoded')
    }

    function isCompressed() {
        if (!has('isCompressed')) {
            const parts = contentEncodings()
            for (const p of parts) {
                set('isCompressed', ['deflate', 'gzip', 'br'].includes(p))
                if (get('isCompressed')) break
            }
        }
        return get('isCompressed')
    }

    function contentEncodings(): string[] {
        if (!has('contentEncodings')) {
            set('contentEncodings', (contentEncoding || '').split(',').map(p => p.trim()).filter(p => !!p))
        }
        return get('contentEncodings') as unknown as string[]
    }

    async function parseBody<T = unknown>() {
        if (!has('parsed')) {
            const body = await uncompressBody(contentEncodings(), (await rawBody()).toString())
            if (isJson()) { set('parsed', jsonParser(body)) }
            else if (isFormData()) { set('parsed', formDataParser(body)) }
            else if (isUrlencoded()) { set('parsed', urlEncodedParser(body)) }
            else if (isBinary()) { set('parsed', textParser(body)) }
            else { set('parsed', textParser(body)) }
        }
        return get('parsed') as T
    }

    function jsonParser(v: string): Record<string, unknown> | unknown[] {
        try {
            return JSON.parse(v) as Record<string, unknown> | unknown[]
        } catch(e) {
            throw new WooksError(400, (e as Error).message)
        }
    }
    function textParser(v: string): string {
        return v
    }

    function formDataParser(v: string): Record<string, unknown> {
        const boundary = '--' + ((/boundary=([^;]+)(?:;|$)/.exec(contentType || '') || [, ''])[1] as string)
        if (!boundary) throw new WooksError(EHttpStatusCode.BadRequest, 'form-data boundary not recognized')
        const parts = v.trim().split(boundary)
        const result: Record<string, unknown> = {}
        let key = ''
        let partContentType = 'text/plain'
        for (const part of parts) {
            parsePart()
            key = ''
            partContentType = 'text/plain'
            let valueMode = false
            const lines = part.trim().split(/\n/g).map(s => s.trim())
            for (const line of lines) {
                if (valueMode) {
                    if (!result[key]) {
                        result[key] = line
                    } else {
                        result[key] += '\n' + line
                    }
                } else {
                    if (!line || line === '--') {
                        valueMode = !!key
                        if (valueMode) {
                            key = key.replace(/^["']/, '').replace(/["']$/, '')
                        }
                        continue
                    }
                    if (line.toLowerCase().startsWith('content-disposition: form-data;')) {
                        key = (/name=([^;]+)/.exec(line) || [])[1]
                        if (!key) throw new WooksError(EHttpStatusCode.BadRequest, 'Could not read multipart name: ' + line)
                        continue
                    }
                    if (line.toLowerCase().startsWith('content-type:')) {
                        partContentType = (/content-type:\s?([^;]+)/i.exec(line) || [])[1]
                        if (!partContentType) throw new WooksError(EHttpStatusCode.BadRequest, 'Could not read content-type: ' + line)
                        continue
                    }
                }
            }
        }
        parsePart()
        function parsePart() {
            if (key) {
                if (partContentType.indexOf('application/json') >= 0) {
                    result[key] = JSON.parse(result[key] as string)
                }
            }
        }
        return result
    }

    function urlEncodedParser(v: string): Record<string, unknown> {
        return new WooksURLSearchParams(v.trim()).toJson()
    }

    return {
        isJson,
        isHtml,
        isXml,
        isText,
        isBinary,
        isFormData,
        isUrlencoded,
        isCompressed,
        contentEncodings,
        parseBody,
        rawBody,
    }
}

export function registerBodyCompressor(name: string, compressor: TBodyCompressor) {
    if (compressors[name]) {
        throw panic(`Body compressor "${name}" already registered.`)
    }
    compressors[name] = compressor
}
