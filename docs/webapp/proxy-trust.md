# Behind a Proxy

Behind nginx, Caddy, a load balancer or a CDN, the socket peer is the proxy, not the client. Tell the app which proxies to trust, and `useRequest().getIp()`, `protocol()` and `host()` report the client:

```ts
import { createHttpApp, useRequest } from '@wooksjs/event-http'

const app = createHttpApp({ trustProxy: 1 }) // one reverse proxy in front

app.get('/whoami', () => {
  const { getIp, protocol, host } = useRequest()
  return { ip: getIp(), secure: protocol() === 'https', host: host() }
})
```

All three come from one resolver, so they always agree on which proxies count.

## Options

| `trustProxy` | Trusts |
|---|---|
| `false` (default) | Nothing. Forwarding headers are ignored; the client is the socket peer. |
| `n` (number) | The first `n` hops from the app. Hop 0 is the socket peer, hop 1 the right-most `X-Forwarded-For` entry, and so on. `1` = a single reverse proxy. |
| `['10.0.0.0/8', 'loopback']` | Hops whose address is in the list: IPs, CIDR ranges (prefix as plain digits), and the presets `'loopback'`, `'linklocal'`, `'uniquelocal'`. A comma string (`'loopback, 10.0.0.0/8'`) works too. |
| `(addr, hopIndex) => boolean` | Your own rule; `hopIndex` 0 is the socket peer. A predicate that throws trusts nothing for that request (the client becomes unknown, `''`), and the error is logged once. |

`trustProxy: true` is rejected at startup, because "trust everyone" lets any client choose its own address. Pass the hop count instead. An invalid entry (`'10.0.0.0/33'`, `'10.0.0.0/0x8'`, `'not-an-ip'`) also throws at startup.

Addresses come in one form everywhere: an IPv4-mapped IPv6 address (`::ffff:10.0.0.5`, what a dual-stack server sees) is turned into plain IPv4 before it is matched, passed to a predicate, or returned by `getIp()`.

| `proxyHeaders` | Reads |
|---|---|
| `'x-forwarded'` (default) | `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host` |
| `'forwarded'` | RFC 7239 `Forwarded` (`for=`, `proto=`, `host=`) |

Only one family is read. A client can send either kind of header, so reading both would let it pick the one your proxies don't manage.

## How the client is found

- **Address.** The resolver walks outward from the app. While the current hop is trusted, it steps to the address that hop forwarded. The first untrusted hop is the client. If the forwarded addresses run out first, the furthest hop reached is the client. Addresses a client wrote itself sit left of every trusted entry, so they are never reached.
- **No forwarding entries.** When a trusted peer sends no forwarding header at all (or only empty list elements, `Forwarded: , ,`), the peer itself is the client — a direct call from inside your network.
- **Unknown client.** When an entry a trusted hop wrote is present but empty, malformed or not an address (`for=` absent from its element, `X-Forwarded-For: 6.6.6.6,,10.0.0.9`), the client is unknown and `getIp()` returns `''`; it does not fall back to that trusted hop's own address. A `Forwarded` obfuscated identifier (`for=unknown`, `for=_hidden`) is returned as it is.
- **Accepted `Forwarded` values.** Structure is strict (element and pair boundaries, quoted strings, `for`/`proto`/`host` at most once per element). A `for=` value may also be an unquoted IP or IP:port, or a bare IPv6 (`for=192.0.2.43:4711`, `for=2001:db8::1`, `for="2001:db8::1"`), as common proxies write it; these characters cannot move a boundary. If the entry your own proxy (the socket peer) wrote is malformed anyway, every client resolves to `''` and a warning is logged once — fix the proxy configuration.
- **`Forwarded` parsing.** Elements are found from the right, so the elements your proxies append keep their boundaries whatever the client put in front of them (an unterminated quote, a stray comma or escape). Each element is then read with the strict RFC 7239 grammar.
- **Protocol and host with `'forwarded'`.** Every proxy appends one element, so each trusted hop's element is read. The outermost trusted element that carries `proto=` or `host=` wins.
- **Protocol and host with `'x-forwarded'`.** These headers are not appended reliably per hop. Only the nearest proxy's value (the right-most entry) is used, and only when hop 0 is trusted. Have the edge proxy set `X-Forwarded-Proto`/`-Host` and let inner proxies pass them on. If inner proxies append their own view, use `'forwarded'` instead.
- **Otherwise.** The socket's own protocol (TLS means `https`) and the `Host` header apply. A protocol other than `http`/`https` is ignored, and a malformed host gives `''` (the `Host` header is validated the same way as a forwarded host).

`host()` is chosen by the client (directly, or through a proxy that passes it on). Check it against your own list of hostnames before you build absolute URLs, redirects or links from it.

A proxy that writes the client's `Host` into `Forwarded: host="…"` must escape it (or leave `host` out). Copied raw, a `Host` containing `"` lets the client close the quoted string and add an element of its own.

## Programmatic `fetch()`

- **Inside a request**, an in-process [`app.fetch()` / `app.request()`](./fetch.md) inherits the caller's resolved client, protocol and host.
- **With no caller** (Bun, Deno, edge runtimes calling `app.fetch(request)` directly), the peer is unknown. List and predicate trust then trust nothing and never read forwarding headers. `protocol()` and `host()` come from the Request URL, and `getIp()` is `''`.
- **Pass the peer** when the runtime knows it, and trust works as on a socket:

  ```ts
  Bun.serve({
    fetch: (request, server) =>
      app.fetch(request, { remoteAddress: server.requestIP(request)?.address }),
  })
  ```

A hop count needs no peer address. On a fetch runtime it trusts whatever sits in front of the app, so use it only when a proxy you control always does.

## Outside a request

The resolver is exported, for code that only has a Node request (a rate limiter, a logger):

```ts
import { compileTrustProxy, resolveForwarded } from '@wooksjs/event-http'

const trust = compileTrustProxy(['10.0.0.0/8'])
const { ip, protocol, host } = resolveForwarded(req, trust, 'x-forwarded')
```

## DOs and DON'Ts

- **Do** trust exactly the proxies every request passes through. With a higher hop count than the real chain, the client controls the extra entries.
- **Do** prefer an address list when proxy addresses are stable. A hop count assumes every request takes the same path.
- **Don't** enable trust when clients can also reach the app directly (an open port next to the load balancer). They can then send forged headers that look like a trusted hop's.
- **Don't** use `getIpList()` for decisions. It returns the raw, unvalidated header values.
- **Don't** build URLs from `host()` without checking it against your hostnames.
- **Don't** keep using `getIp({ trustProxy: true })`. It is deprecated and now means "trust one hop".
