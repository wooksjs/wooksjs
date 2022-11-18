import { renderCookie } from '../set-cookie'

describe('set-cookie', () => {
    it('must set cookie key-value pair', () => {
        expect(renderCookie('cookie-key', { value: 'cookie-value', attrs: {} })).toEqual('cookie-key=cookie-value')
    })
    it('must set "expires"', () => {
        expect(renderCookie('cookie-key', { value: 'cookie-value', attrs: { expires: '2020-02-02' } })).toEqual('cookie-key=cookie-value; Expires=Sun, 02 Feb 2020 00:00:00 GMT')
    })
    it('must set "maxAge"', () => {
        expect(renderCookie('cookie-key', { value: 'cookie-value', attrs: { maxAge: '15m' } })).toEqual('cookie-key=cookie-value; Max-Age=900')
    })
    it('must set "domain"', () => {
        expect(renderCookie('cookie-key', { value: 'cookie-value', attrs: { domain: 'my-domain' } })).toEqual('cookie-key=cookie-value; Domain=my-domain')
    })
    it('must set "path"', () => {
        expect(renderCookie('cookie-key', { value: 'cookie-value', attrs: { path: '/my-path' } })).toEqual('cookie-key=cookie-value; Path=/my-path')
    })
    it('must set "secure"', () => {
        expect(renderCookie('cookie-key', { value: 'cookie-value', attrs: { secure: true } })).toEqual('cookie-key=cookie-value; Secure')
    })
    it('must set "httpOnly"', () => {
        expect(renderCookie('cookie-key', { value: 'cookie-value', attrs: { httpOnly: true } })).toEqual('cookie-key=cookie-value; HttpOnly')
    })
    it('must set "sameSite"', () => {
        expect(renderCookie('cookie-key', { value: 'cookie-value', attrs: { sameSite: true } })).toEqual('cookie-key=cookie-value; SameSite=Strict')
    })
    it('must set "sameSite" = Lax', () => {
        expect(renderCookie('cookie-key', { value: 'cookie-value', attrs: { sameSite: 'Lax' } })).toEqual('cookie-key=cookie-value; SameSite=Lax')
    })
})
