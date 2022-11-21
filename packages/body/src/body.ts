import { useHeaders, useRequest, EHttpStatusCode, WooksError, WooksURLSearchParams, useHttpContext } from '@wooksjs/http-event'
import { panic } from 'common/panic'
import { compressors, TBodyCompressor, uncompressBody } from './utils/body-compressor'

type TBodyStore = { 
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
    const { store } = useHttpContext<{ request: TBodyStore }>()
    const { hook } = store('request')
    const { rawBody } = useRequest()
    const { 'content-type': contentType, 'content-encoding': contentEncoding } = useHeaders()

    function contentIs(type: string) {
        return (contentType || '').indexOf(type) >= 0
    }

    function isJson() {
        const _isJson = hook('isJson')
        if (!_isJson.isDefined) {
            return _isJson.value = contentIs('application/json')
        }
        return _isJson.value
    }

    function isHtml() {
        const _isHtml = hook('isHtml')
        if (!_isHtml.isDefined) {
            return _isHtml.value = contentIs('text/html')
        }
        return _isHtml.value
    }

    function isXml() {
        const _isXml = hook('isXml')
        if (!_isXml.isDefined) {
            return _isXml.value = contentIs('text/xml')
        }
        return _isXml.value
    }

    function isText() {
        const _isText = hook('isText')
        if (!_isText.isDefined) {
            return _isText.value = contentIs('text/plain')
        }
        return _isText.value
    }

    function isBinary() {
        const _isBinary = hook('isBinary')
        if (!_isBinary.isDefined) {
            return _isBinary.value = contentIs('application/octet-stream')
        }
        return _isBinary.value
    }

    function isFormData() {
        const _isFormData = hook('isFormData')
        if (!_isFormData.isDefined) {
            return _isFormData.value = contentIs('multipart/form-data')
        }
        return _isFormData.value
    }

    function isUrlencoded() {
        const _isUrlencoded = hook('isUrlencoded')
        if (!_isUrlencoded.isDefined) {
            return _isUrlencoded.value = contentIs('application/x-www-form-urlencoded')
        }
        return _isUrlencoded.value
    }

    function isCompressed() {
        const _isCompressed = hook('isCompressed')
        if (!_isCompressed.isDefined) {
            const parts = contentEncodings()
            for (const p of parts) {
                _isCompressed.value = ['deflate', 'gzip', 'br'].includes(p)
                if (_isCompressed.value) break
            }
        }
        return _isCompressed.value
    }

    function contentEncodings(): string[] {
        const _contentEncodings = hook('contentEncodings')
        if (!_contentEncodings.isDefined) {
            _contentEncodings.value = (contentEncoding || '').split(',').map(p => p.trim()).filter(p => !!p)
        }
        return _contentEncodings.value as unknown as string[]
    }

    async function parseBody<T = unknown>() {
        const _parsed = hook('parsed')
        if (!_parsed.isDefined) {
            const body = await uncompressBody(contentEncodings(), (await rawBody()).toString())
            if (isJson()) { _parsed.value = jsonParser(body) }
            else if (isFormData()) { _parsed.value = formDataParser(body) }
            else if (isUrlencoded()) { _parsed.value = urlEncodedParser(body) }
            else if (isBinary()) { _parsed.value = textParser(body) }
            else { _parsed.value = textParser(body) }
        }
        return _parsed.value as T
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
