import { describe, it, expect } from 'vitest';
import {
  createEventContext,
  defineEventKind,
  defineWook,
  cached,
  slot,
  current,
  useLogger,
} from '../index';
import type { Logger } from '../index';

const logger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

describe('Integration: HTTP + workflow + wooks', () => {
  // ── Define HTTP kind ──
  const http = defineEventKind('http', {
    method: slot<string>(),
    path: slot<string>(),
    rawHeaders: slot<Record<string, string>>(),
  });

  const cookieMap = cached((ctx) => {
    const cookie = ctx.get(http.keys.rawHeaders)['cookie'] ?? '';
    return Object.fromEntries(
      cookie.split('; ').filter(Boolean).map((p) => p.split('=')),
    );
  });

  const useRequest = defineWook((ctx) => ({
    method: ctx.get(http.keys.method),
    path: ctx.get(http.keys.path),
    headers: ctx.get(http.keys.rawHeaders),
    getCookie: (name: string): string | undefined => ctx.get(cookieMap)[name],
  }));

  // ── Define workflow kind ──
  const workflow = defineEventKind('wf', {
    triggerId: slot<string>(),
    payload: slot<unknown>(),
  });

  const useWorkflow = defineWook((ctx) => ({
    triggerId: ctx.get(workflow.keys.triggerId),
    payload: ctx.get(workflow.keys.payload),
  }));

  // ── Cross-kind cached ──
  const auditEntry = cached((ctx) => ({
    method: ctx.get(http.keys.method),
    workflow: ctx.get(workflow.keys.triggerId),
  }));

  it('full lifecycle: create → attach → wooks → cross-kind', () => {
    createEventContext(
      { logger },
      http,
      {
        method: 'POST',
        path: '/webhook',
        rawHeaders: { cookie: 'session=abc123; theme=dark' },
      },
      () => {
        // HTTP wook works
        const { method, path, getCookie } = useRequest();
        expect(method).toBe('POST');
        expect(path).toBe('/webhook');
        expect(getCookie('session')).toBe('abc123');
        expect(getCookie('theme')).toBe('dark');

        // Logger available
        expect(useLogger()).toBe(logger);

        // Attach workflow kind mid-event
        const ctx = current();
        ctx.attach(workflow, { triggerId: 'deploy-42', payload: { env: 'prod' } });

        // Workflow wook works
        const { triggerId, payload } = useWorkflow();
        expect(triggerId).toBe('deploy-42');
        expect(payload).toEqual({ env: 'prod' });

        // Cross-kind cached works
        expect(ctx.get(auditEntry)).toEqual({
          method: 'POST',
          workflow: 'deploy-42',
        });
      },
    );
  });

  it('body-parser extension pattern', async () => {
    // Simulates a body-parser library that depends on HTTP kind
    let parseCalls = 0;
    const rawBody = cached(async () => Buffer.from('{"action":"deploy"}'));
    const parsedBody = cached(async (ctx) => {
      parseCalls++;
      const buf = await ctx.get(rawBody);
      return JSON.parse(buf.toString());
    });
    const useBody = defineWook((ctx) => ({
      parseBody: () => ctx.get(parsedBody),
    }));

    await createEventContext(
      { logger },
      http,
      { method: 'POST', path: '/api', rawHeaders: {} },
      async () => {
        // Auth interceptor parses body
        const { parseBody } = useBody();
        const body1 = await parseBody();
        expect(body1).toEqual({ action: 'deploy' });

        // Handler parses body again — cached
        const body2 = await useBody().parseBody();
        expect(body2).toBe(body1);
        expect(parseCalls).toBe(1);
      },
    );
  });
});
