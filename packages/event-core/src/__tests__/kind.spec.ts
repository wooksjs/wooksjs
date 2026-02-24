import { describe, it, expect } from 'vitest';
import { slot, defineEventKind, key, cached, EventContext } from '../index';

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

describe('defineEventKind', () => {
  it('creates keys for each slot in the schema', () => {
    const http = defineEventKind('http', {
      method: slot<string>(),
      path: slot<string>(),
    });

    expect(http.name).toBe('http');
    expect(http.keys.method._name).toBe('http.method');
    expect(http.keys.path._name).toBe('http.path');
    expect(http.keys.method._id).not.toBe(http.keys.path._id);
  });

  it('attach seeds a context with typed values', () => {
    const http = defineEventKind('http', {
      method: slot<string>(),
      path: slot<string>(),
    });

    const ctx = new EventContext({ logger });
    ctx.attach(http, { method: 'GET', path: '/users' });

    expect(ctx.get(http.keys.method)).toBe('GET');
    expect(ctx.get(http.keys.path)).toBe('/users');
  });

  it('supports multiple kinds on the same context', () => {
    const http = defineEventKind('http', {
      method: slot<string>(),
    });
    const workflow = defineEventKind('wf', {
      triggerId: slot<string>(),
    });

    const ctx = new EventContext({ logger });
    ctx.attach(http, { method: 'POST' });
    ctx.attach(workflow, { triggerId: 'wf-001' });

    expect(ctx.get(http.keys.method)).toBe('POST');
    expect(ctx.get(workflow.keys.triggerId)).toBe('wf-001');
  });

  it('cached values can depend on keys from different kinds', () => {
    const http = defineEventKind('http', {
      method: slot<string>(),
    });
    const workflow = defineEventKind('wf', {
      triggerId: slot<string>(),
    });
    const summary = cached(
      (ctx) => `${ctx.get(http.keys.method)} → ${ctx.get(workflow.keys.triggerId)}`,
    );

    const ctx = new EventContext({ logger });
    ctx.attach(http, { method: 'POST' });
    ctx.attach(workflow, { triggerId: 'deploy-123' });

    expect(ctx.get(summary)).toBe('POST → deploy-123');
  });
});
