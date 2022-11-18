import { applyProxyControls, CookiesIterable, HeadersIterable } from './proxy-utils'

describe('composables/proxy', () => {
    const headers = {
        'content-type': 'application/json',
        'content-length': '256',
        'accept': '*',
    }
    const cookies = 'cookie-name-1=my%20value%201; Expires=Tue, 03 Jan 2023 00:00:00 GMT, cookie-name-2=my%20value%201; Expires=Tue, 03-Jan-2023 00:00:00 GMT, another-cookie=my%20value%202'
    describe('CookiesIterable', () => {
        it('must iterate over cookies', () => {
            const check = [
                ['cookie-name-1', 'my%20value%201; Expires=Tue, 03 Jan 2023 00:00:00 GMT'],
                ['cookie-name-2', 'my%20value%201; Expires=Tue, 03-Jan-2023 00:00:00 GMT'],
                ['another-cookie', 'my%20value%202'],
            ]
            const data = new CookiesIterable(cookies)
            let i = 0
            for (const [name, value] of data) {
                const [n, v] = check[i++]
                expect(name).toBe(n)
                expect(value).toBe(v)
            }
            expect(i).toBe(check.length)
        })
    })
    describe('HeadersIterable', () => {
        it('must iterate over headers object', () => {
            const check = [
                ['content-type', 'application/json'],
                ['content-length', '256'],
                ['accept', '*'],
            ]
            const data = new HeadersIterable(headers)
            let i = 0
            for (const [name, value] of data) {
                const [n, v] = check[i++]
                expect(name).toBe(n)
                expect(value).toBe(v)
            }
        })
    })
    describe('applyProxyControls', () => {
        it('must pass all the headers when controls are empty', () => {
            expect(applyProxyControls(new HeadersIterable(headers), {})).toEqual(headers)
        })
        it('must pass all the headers when allowList = "*"', () => {
            expect(applyProxyControls(new HeadersIterable(headers), {
                allow: '*',
            })).toEqual(headers)
        })
        it('must filter by allowList (string[])', () => {
            expect(applyProxyControls(new HeadersIterable(headers), {
                allow: ['accept'],
            })).toEqual({ accept: '*' })
        })
        it('must filter by allowList (regexp[])', () => {
            expect(applyProxyControls(new HeadersIterable(headers), {
                allow: [/^a/],
            })).toEqual({ accept: '*' })
        })
        it('must filter by allowList (regexp | stirng[])', () => {
            expect(applyProxyControls(new HeadersIterable(headers), {
                allow: [/type$/, 'accept'],
            })).toEqual({ accept: '*', 'content-type': 'application/json' })
        })
        it('must block headers from blocklist (string[])', () => {
            expect(applyProxyControls(new HeadersIterable(headers), {
                allow: '*',
                block: ['content-type', 'content-length'],
            })).toEqual({ accept: '*' })
        })
        it('must block headers from blocklist (regexp[])', () => {
            expect(applyProxyControls(new HeadersIterable(headers), {
                allow: '*',
                block: [/content/],
            })).toEqual({ accept: '*' })
        })
        it('must block headers from blocklist (string | regexp[])', () => {
            expect(applyProxyControls(new HeadersIterable(headers), {
                allow: '*',
                block: [/type$/, /length$/],
            })).toEqual({ accept: '*' })
        })
        it('must block all *', () => {
            expect(applyProxyControls(new HeadersIterable(headers), {
                allow: '*',
                block: '*',
            })).toEqual({})
        })
        it('must overwrite object', () => {
            expect(applyProxyControls(new HeadersIterable(headers), {
                allow: ['accept'],
                overwrite: { accept: 'text/plain' },
            })).toEqual({ accept: 'text/plain' })
        })
        it('must overwrite with callback', () => {
            expect(applyProxyControls(new HeadersIterable(headers), {
                allow: ['accept'],
                overwrite: (o) => ({ ...o, accept: 'text/plain' }),
            })).toEqual({ accept: 'text/plain' })
        })
        it('must pass all cookies allowList = "*"', () => {
            expect(applyProxyControls(new CookiesIterable(cookies), {
                allow: '*',
            })).toEqual({
                'cookie-name-1': 'my%20value%201; Expires=Tue, 03 Jan 2023 00:00:00 GMT',
                'cookie-name-2': 'my%20value%201; Expires=Tue, 03-Jan-2023 00:00:00 GMT',
                'another-cookie': 'my%20value%202',
            })
        })
        it('must filter cookies by allowList (string[])', () => {
            expect(applyProxyControls(new CookiesIterable(cookies), {
                allow: ['cookie-name-1'],
            })).toEqual({ 'cookie-name-1': 'my%20value%201; Expires=Tue, 03 Jan 2023 00:00:00 GMT' })
        })
    })
})
