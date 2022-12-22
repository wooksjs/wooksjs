import http, { RequestListener, Server } from 'http'

export interface THttpOptions {
    port: number    
}



export function createServer(opts: THttpOptions, cb: RequestListener, hostname?: string, onListen?: () => void): Server {
    const server = http.createServer(cb)
    if (hostname) {
        server.listen(opts.port, hostname, onListen)
    } else {
        server.listen(opts.port, onListen)
    }
    
    return server
}
