/**
 * HTTP Event Context
 *
 * Demonstrates: defineEventKind, slot, cached, cachedBy,
 *               defineWook, plain function, thunks, createEventContext
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  defineEventKind,
  slot,
  cached,
  cachedBy,
  defineWook,
  createEventContext,
  current,
  type EventContext,
  type Logger,
} from '../src/index';

// ═══════════════════════════════════════════════
// Event Kind — seed values provided at event creation
// ═══════════════════════════════════════════════

export const httpKind = defineEventKind('http', {
  req: slot<IncomingMessage>(),
  res: slot<ServerResponse>(),
  routeParams: slot<Record<string, string>>(),
});

// ═══════════════════════════════════════════════
// Cached computations — internal building blocks
// Exported for library-to-library use (e.g. body-parser)
// ═══════════════════════════════════════════════

/** Raw headers object — cached, derived from req seed */
export const headersMap = cached(
  (ctx) => ctx.get(httpKind.keys.req).headers,
);

/** Parsed URL — cached, avoids re-parsing */
export const parsedUrl = cached((ctx) => {
  const req = ctx.get(httpKind.keys.req);
  return new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
});

/** Query string → Record — deferred via thunk in wooks */
export const parsedQuery = cached((ctx) =>
  Object.fromEntries(ctx.get(parsedUrl).searchParams),
);

/** Raw body buffer — async, cached (Promise deduplication) */
export const rawBody = cached(
  (ctx) =>
    new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const req = ctx.get(httpKind.keys.req);
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    }),
);

// ═══════════════════════════════════════════════
// cachedBy — per-cookie regex extraction
// ═══════════════════════════════════════════════

/** Extract a single cookie by name. One regex scan per unique name, cached. */
export const useCookie = cachedBy((name: string, ctx) => {
  const header = ctx.get(headersMap)['cookie'] ?? '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
});

// ═══════════════════════════════════════════════
// Wooks — public API for consumers
// ═══════════════════════════════════════════════

/**
 * Core HTTP event access — raw req/res + route params.
 * Use when you need the underlying Node objects.
 */
export const useHttpEvent = defineWook((ctx) => ({
  req: ctx.get(httpKind.keys.req),
  res: ctx.get(httpKind.keys.res),
  params: ctx.get(httpKind.keys.routeParams),
}));

/**
 * Request tools — method is direct (always used), everything else is a thunk.
 * Thunks ensure URL parsing, query parsing, body reading only happen on demand.
 */
export const useRequest = defineWook((ctx) => ({
  // Direct — O(1) key lookup + property access, always needed
  method: ctx.get(httpKind.keys.req).method ?? 'GET',
  params: ctx.get(httpKind.keys.routeParams),

  // Thunks — deferred, computed + cached on first call
  url: () => ctx.get(parsedUrl),
  path: () => ctx.get(parsedUrl).pathname,
  query: () => ctx.get(parsedQuery),
  headers: () => ctx.get(headersMap),
  header: (name: string) => ctx.get(headersMap)[name.toLowerCase()],
  rawBody: () => ctx.get(rawBody),
}));

/**
 * Response tools — thin wrappers around ServerResponse.
 * All methods are direct (they're just functions, no computation).
 */
export const useResponse = defineWook((ctx) => {
  const res = ctx.get(httpKind.keys.res);

  return {
    status(code: number) {
      res.statusCode = code;
      return this;
    },

    setHeader(name: string, value: string) {
      res.setHeader(name, value);
      return this;
    },

    json(data: unknown) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    },

    text(body: string) {
      res.setHeader('Content-Type', 'text/plain');
      res.end(body);
    },

    redirect(url: string, code = 302) {
      res.writeHead(code, { Location: url });
      res.end();
    },
  };
});

// ═══════════════════════════════════════════════
// Factory — typed entry point for HTTP events
// ═══════════════════════════════════════════════

export function createHttpEvent<R>(
  opts: {
    req: IncomingMessage;
    res: ServerResponse;
    routeParams?: Record<string, string>;
    logger: Logger;
  },
  fn: () => R,
): R {
  return createEventContext(
    { logger: opts.logger },
    httpKind,
    {
      req: opts.req,
      res: opts.res,
      routeParams: opts.routeParams ?? {},
    },
    fn,
  );
}
