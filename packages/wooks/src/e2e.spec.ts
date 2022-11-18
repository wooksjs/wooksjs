import { useCookies, useResponse, useRouteParams, useSearchParams, useSetCookies, useSetHeaders, BaseWooksResponse } from '@wooksjs/composables'
import { Wooks } from './wooks'
import http, { IncomingMessage, OutgoingHttpHeaders } from 'http'
import { useBody } from '@wooksjs/body'

const PORT = 3043

const cookie = [
    'test-cookie=test-value',
]

let accept = '*/*'
let contentType = 'text/plain'

const sendRequest = (method: string, path: string, body?: string): Promise<IncomingMessage> => {
    return new Promise((resolve) => {
        const headers: OutgoingHttpHeaders = { cookie, accept }
        if (body) {
            headers['content-type'] = contentType
            headers['content-length'] = Buffer.byteLength(body)
        }
        const req = http.request('http://localhost:' + PORT.toString() + '/' + path,
            { method, headers },
            (res) => {
                // console.log(res.headers)
                resolve(res)
            })
        if (body) {
            req.write(body)
        }
        req.end()
    })
}

const get = (path: string): Promise<IncomingMessage> => {
    return sendRequest('GET', path)
}

const post = (path: string, body: string): Promise<IncomingMessage> => {
    return sendRequest('POST', path, body)
}

async function getBody(path: string, postBody?: string): Promise<string> {
    const req = await (postBody ? post(path, postBody) : get(path))
    let body = Buffer.from('')
    return await (new Promise((resolve, reject) => {
        req.on('data', function(chunk) {
            body = Buffer.concat([body, chunk])
        })
        req.on('error', function(err) {
            reject(err)
        })
        req.on('end', function() {
            resolve(body.toString())
        })
    }))
}

async function getHeader(path: string, headerName: string) {
    const req = await get(path)
    return req.headers[headerName]
}

async function getStatus(path: string) {
    const req = await get(path)
    return req.statusCode || 0
}

describe('Wooks E2E', () => {
    const app = new Wooks()

    beforeAll(async () => {
        await app.listen(PORT)
    })

    app.get('/json', () => {
        return { a: 'a', b: [1, 2, 3] }
    })
    
    app.get('/set-cookie', () => {
        const { setCookie } = useSetCookies()
        setCookie('my-cookie', 'test', { maxAge: '1d' })
        return 'ok'
    })
    
    app.get('/set-header', () => {
        const { setHeader } = useSetHeaders()
        setHeader('myHeader', 'value')
        return 'ok'
    })
    
    app.get('/set-status', () => {
        const { status } = useResponse()
        status(202)
        return 'ok'
    })
    
    app.get('/parse-cookie', () => {
        const { getCookie } = useCookies()
        return getCookie('test-cookie')
    })
    
    app.get('/params/:p1/:p2', () => {
        const { getRouteParam } = useRouteParams()
        return [getRouteParam('p1') as unknown as string, getRouteParam('p2') as unknown as string]
    })
    
    app.get('/query', () => {
        const { urlSearchParams } = useSearchParams()
        return [urlSearchParams().get('p1'), urlSearchParams().get('p2')]
    })
    
    app.get('/error', () => {
        throw new Error('test error')
    })
    
    app.post('/post', () => {
        const { parseBody } = useBody()
        return parseBody()
    })
    
    app.get('/overwrite', () => {
        const response = new BaseWooksResponse()
        const { status } = useResponse()
        const { setCookie } = useSetCookies()
        const { setHeader } = useSetHeaders()
        status(201)
        setCookie('myCookie', 'C Value', { maxAge: '2d' })
        setHeader('myHeader', 'H Value')
        response.setCookie('myCookie', 'New C Value', { expires: '2021-03-04' })
        response.setHeader('myHeader', 'New H Value')
        response.setStatus(205)
        return response
    })

    it('must reply in json', async () => {
        expect((await getBody('json'))).toEqual('{"a":"a","b":[1,2,3]}')
    })

    it('must set cookie in response', async () => {
        expect((await get('set-cookie')).headers?.['set-cookie']).toEqual(['my-cookie=test; Max-Age=86400'])
    })

    it('must set header in response', async () => {
        expect((await getHeader('set-header', 'myheader'))).toEqual('value')
    })

    it('must set status in response', async () => {
        expect((await getStatus('set-status'))).toEqual(202)
    })

    it('must parse cookie', async () => {
        expect((await getBody('parse-cookie'))).toEqual('test-value')
    })

    it('must respond 404 for non-existing route', async () => {
        accept = 'application/json'
        expect((await getBody('non-existing'))).toEqual('{"statusCode":404,"error":"Not Found","message":""}')
        accept = 'text/plain'
        expect((await getBody('non-existing'))).toContain('404 Not Found\n')
    })

    it('must parse route params', async () => {
        expect((await getBody('params/value1/value%232'))).toEqual('["value1","value#2"]')
    })

    it('must parse query params', async () => {
        expect((await getBody('query?p1=value1&p2=value%232'))).toEqual('["value1","value#2"]')
    })

    it('must catch error', async () => {
        accept = 'application/json'
        expect((await getBody('error'))).toEqual('{"statusCode":500,"error":"Internal Server Error","message":"test error"}')
    })

    it('must parse body in post request', async () => {
        contentType = 'application/json'
        accept = 'application/json'
        expect((await getBody('post', JSON.stringify({a: 'a', b: [1, 2, 3]}))))
            .toEqual('{"a":"a","b":[1,2,3]}')
    })

    it('must return error 400 when json body is bad', async () => {
        contentType = 'application/json'
        accept = 'application/json'
        expect((await getBody('post', JSON.stringify({a: 'a', b: [1, 2, 3]}).slice(0, 5))))
            .toEqual('{"statusCode":400,"error":"Bad Request","message":"Unexpected end of JSON input"}')
    })

    it('must overwrite header, cookie and status from response instance', async () => {
        const res = await get('overwrite')
        expect(res.headers['myheader']).toEqual('New H Value')
        expect(res.statusCode).toEqual(205)
        expect(res.headers['set-cookie']).toEqual(['myCookie=New%20C%20Value; Expires=Thu, 04 Mar 2021 00:00:00 GMT'])
    })

    afterAll(async () => {
        await app.close()
    })
})
