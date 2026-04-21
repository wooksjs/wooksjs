# Outlet Token Security Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the authentication-bypass bug where out-of-band outlets (email magic links) leak the resumption token to the HTTP dispatcher, and close the broader replay-via-reused-token risk by calling `strategy.consume()` atomically on every resume — truly single-use with `HandleStateStrategy`; `EncapsulatedStateStrategy` is called out in docs as unable to enforce single-use.

**Architecture:** Extend `WfOutlet` with one new field `tokenDelivery?: 'caller' | 'out-of-band'`. The trigger consults this field in two gates (response-body merge, cookie write) to decide whether the dispatcher gets to see the token. Orthogonally, replace the current conditional `retrieve() + maybe consume()` flow with unconditional atomic `consume()` at resume entry — so the trigger calls `consume()` on every resume regardless of outlet type, race-safe by construction. Tokens are truly single-use with strategies that support invalidation (`HandleStateStrategy`, via atomic `getAndDelete`); with `EncapsulatedStateStrategy` the consume is a no-op and the token remains replayable until TTL. Honest docstrings, README, vitepress docs, and AI-agent skill advise that `EncapsulatedStateStrategy` cannot enforce single-use and is inappropriate for security-sensitive flows, and document the per-wfid strategy constraint.

**Tech Stack:** TypeScript, pnpm monorepo, vitest, Rolldown (wooksjs) / tsdown (prostojs), oxlint + oxfmt.

**Repos / surfaces touched:**
- `../prostojs/wf` — interface extension + docstrings + README. Released first.
- `/Users/mavrik/code/wooksjs/packages/event-wf/src/outlets/*` — trigger logic, built-in outlets, types.
- `/Users/mavrik/code/wooksjs/docs/wf/outlets.md` — vitepress user docs.
- `/Users/mavrik/code/wooksjs/skills/wooksjs/references/wf-outlets.md` — AI-agent skill reference.
- `/Users/mavrik/code/wooksjs/packages/event-wf/src/outlets/outlets.spec.ts` — tests.

---

## Phase 1 — `@prostojs/wf`: interface extension + docs + release

**Working directory for Phase 1:** `/Users/mavrik/code/prostojs/wf`

### Task 1: Add `tokenDelivery` to `WfOutlet` interface

**Files:**
- Modify: `/Users/mavrik/code/prostojs/wf/src/outlets/outlet.ts`

- [ ] **Step 1: Edit the interface**

Replace the contents of `src/outlets/outlet.ts` with:

```ts
import type { WfOutletRequest, WfOutletResult } from './types';

/**
 * An outlet delivers a workflow pause to the outside world.
 *
 * Built-in outlets (HTTP, email) ship in higher-level packages.
 * Users implement this interface for custom delivery mechanisms
 * (Slack, pending tasks, webhooks, push notifications, etc.).
 */
export interface WfOutlet {
    /** Unique outlet name. Steps reference this in outlet requests. */
    readonly name: string;

    /**
     * Deliver a workflow pause.
     *
     * @param request — what the step requested (outlet name, payload, target, context)
     * @param token   — serialized state token (encrypted blob or DB handle).
     *                  The outlet embeds this in whatever it delivers so the workflow
     *                  can be resumed later.
     * @returns what to send back to the caller, or void if the outlet handles
     *          the response itself (e.g., email outlets return a confirmation).
     */
    deliver(
        request: WfOutletRequest,
        token: string,
    ): Promise<WfOutletResult | void>;

    /**
     * How the resumption token reaches the resumer.
     *
     * - `"caller"` (default) — the HTTP caller who triggered the pause is also
     *   the resumer (e.g. HTTP form step, multi-step wizard). The trigger layer
     *   is allowed to include the token in the HTTP response (body merge or
     *   `Set-Cookie`) so the caller can submit the next step.
     *
     * - `"out-of-band"` — the token travels through the outlet's own channel
     *   (email magic link, SMS OTP, Slack button, webhook callback). The
     *   caller who triggered the pause is a bystander — they MUST NOT receive
     *   the token in the HTTP response. Trigger-layer body merge and cookie
     *   write are suppressed for this outlet.
     *
     * Omitting this field is equivalent to `"caller"` and is only appropriate
     * for same-session continuation outlets. Any outlet that delivers to a
     * different principal than the caller MUST declare `"out-of-band"`.
     */
    readonly tokenDelivery?: 'caller' | 'out-of-band';
}
```

- [ ] **Step 2: Run build + tests to confirm no regression**

Run: `cd /Users/mavrik/code/prostojs/wf && pnpm build && pnpm test`
Expected: build succeeds; all existing tests pass (this is a pure type addition, no runtime change).

- [ ] **Step 3: Commit**

```bash
cd /Users/mavrik/code/prostojs/wf
git add src/outlets/outlet.ts
git commit -m "feat(outlets): add tokenDelivery field to WfOutlet interface"
```

---

### Task 2: Security-honest docstrings on state strategies

**Files:**
- Modify: `/Users/mavrik/code/prostojs/wf/src/outlets/state/strategy.ts`
- Modify: `/Users/mavrik/code/prostojs/wf/src/outlets/state/encapsulated.ts`

- [ ] **Step 1: Update `WfStateStrategy` docstring**

Edit `src/outlets/state/strategy.ts` — replace the whole file with:

```ts
import type { WfState } from '../types';

/**
 * Strategy for persisting workflow state between round-trips.
 *
 * Two built-in strategies:
 * - `EncapsulatedStateStrategy` — self-contained encrypted token (no server storage).
 * - `HandleStateStrategy` — server-side storage, only a short handle travels.
 *
 * ## Security note — token replay
 *
 * The resumption token allows the holder to continue the workflow from the
 * point where it was paused. This means any reuse of a live token re-executes
 * the step handler at that point, which is safe for idempotent data-collection
 * steps but dangerous for steps with real-world side effects (financial
 * transactions, credential changes, account provisioning).
 *
 * Single-use invalidation is provided via `consume()`:
 *
 * - `HandleStateStrategy.consume()` atomically deletes the server-side handle
 *   (via `WfStateStore.getAndDelete`), so a consumed token cannot be reused.
 *
 * - `EncapsulatedStateStrategy.consume()` is identical to `retrieve()` — the
 *   strategy is stateless and cannot enforce single-use. A copy of the
 *   encrypted token remains valid for the full TTL regardless of any consume
 *   call. See `EncapsulatedStateStrategy` for guidance on when this is
 *   acceptable.
 *
 * Higher-level layers (e.g. `@wooksjs/event-wf`'s outlet trigger) should call
 * `consume()` on every resume to get single-use semantics where the strategy
 * supports it.
 */
export interface WfStateStrategy {
    /**
     * Persist workflow state. Returns a token that can be used to retrieve it.
     *
     * @param state   — workflow state (schemaId, context, indexes)
     * @param options — optional TTL in milliseconds
     * @returns opaque token string (encrypted blob or DB handle)
     */
    persist(state: WfState, options?: { ttl?: number }): Promise<string>;

    /**
     * Retrieve workflow state from a token WITHOUT invalidating it.
     * Returns null if token is invalid, expired, or tampered with.
     *
     * Prefer `consume()` for callers that advance the workflow — retaining a
     * live token after use enables replay.
     */
    retrieve(token: string): Promise<WfState | null>;

    /**
     * Atomically retrieve AND invalidate the token. Returns null if the token
     * is invalid, expired, or already consumed.
     *
     * For `HandleStateStrategy` this is truly single-use and race-safe —
     * backed by the store's atomic `getAndDelete`.
     *
     * For `EncapsulatedStateStrategy` this is identical to `retrieve()` — the
     * strategy has no server-side state to delete, so a copy of the token
     * remains valid for the full TTL. Use `HandleStateStrategy` if single-use
     * is a security requirement.
     */
    consume(token: string): Promise<WfState | null>;
}
```

- [ ] **Step 2: Update `EncapsulatedStateStrategy` docstring**

Edit `src/outlets/state/encapsulated.ts` — replace the class docstring (lines 12-27) so the final class block reads:

```ts
/**
 * Self-contained AES-256-GCM encrypted state strategy.
 *
 * Workflow state is encrypted into a base64url token that travels with the
 * transport (cookie, URL param, hidden field). No server-side storage needed.
 *
 * Token format: `base64url(iv[12] + authTag[16] + ciphertext)`
 *
 * ## Security warning — replay
 *
 * This strategy is STATELESS. It cannot enforce single-use semantics:
 * `consume()` is a no-op alias for `retrieve()` because there is no
 * server-side record to delete. Anyone who obtains a copy of the token
 * (browser history, server logs, shoulder-surfing, intermediate proxy,
 * shared device) can replay it until the TTL expires.
 *
 * Use `EncapsulatedStateStrategy` ONLY when BOTH of the following hold:
 *
 * 1. Every workflow step is idempotent — re-executing a step with the same
 *    input produces no harmful side effects (pure data collection,
 *    validation-only steps).
 * 2. The flow is not security-sensitive — no credential changes, financial
 *    operations, account provisioning, permission grants, or any other
 *    privileged action.
 *
 * For auth flows (login, password reset, invite accept), financial
 * operations, or anything with meaningful side effects, use
 * `HandleStateStrategy` with a durable `WfStateStore`. `HandleStateStrategy`
 * supports true single-use tokens via atomic `getAndDelete` at the store
 * layer.
 *
 * @example
 * const strategy = new EncapsulatedStateStrategy({
 *     secret: crypto.randomBytes(32),
 *     defaultTtl: 3600_000, // 1 hour
 * });
 * const token = await strategy.persist(state);
 * const recovered = await strategy.retrieve(token);
 */
export class EncapsulatedStateStrategy implements WfStateStrategy {
```

Concretely: replace the block that currently begins at line 12 (`/**`) through line 28 (`export class ...`) with the new block above.

- [ ] **Step 3: Also update `consume()` method docstring in encapsulated.ts**

At the existing `consume(token: string)` method (currently line 72-76), replace the docstring so the method reads:

```ts
    /**
     * Stateless — CANNOT invalidate the token. Returns identical result to
     * `retrieve()`. See the class-level security warning.
     *
     * This method exists only to satisfy the `WfStateStrategy` contract.
     * Callers that need true single-use semantics must use
     * `HandleStateStrategy`.
     */
    async consume(token: string): Promise<WfState | null> {
        // Stateless — cannot invalidate. Same as retrieve.
        return this.decrypt(token);
    }
```

- [ ] **Step 4: Run build + tests**

Run: `cd /Users/mavrik/code/prostojs/wf && pnpm build && pnpm test`
Expected: all passing. No runtime behavior changed.

- [ ] **Step 5: Commit**

```bash
cd /Users/mavrik/code/prostojs/wf
git add src/outlets/state/strategy.ts src/outlets/state/encapsulated.ts
git commit -m "docs(outlets): document token replay risk in state strategy contracts"
```

---

### Task 3: README state-strategy advisory

**Files:**
- Modify: `/Users/mavrik/code/prostojs/wf/README.md`

- [ ] **Step 1: Update the State Strategies section**

Find the block currently at `README.md:401-429` (the `### State Strategies` section) and replace it with:

```markdown
### State Strategies

Two built-in strategies for persisting workflow state between round-trips.
**Choose based on whether your flow is security-sensitive.** See the security
note at the end of this section.

**EncapsulatedStateStrategy** — self-contained AES-256-GCM encrypted tokens. No
server storage needed. Appropriate for **idempotent, non-sensitive** flows
(multi-step forms, data collection). See security warning below.

```ts
import { randomBytes } from 'node:crypto';

const strategy = new EncapsulatedStateStrategy({
    secret: randomBytes(32),
    defaultTtl: 3600_000, // 1 hour
});

const token = await strategy.persist(result.state);  // encrypted base64url string
const state = await strategy.retrieve(token);         // null if expired/tampered
```

**HandleStateStrategy** — server-side storage with short opaque handles. Supports
true single-use tokens via atomic `consume()`. **Required for security-sensitive
flows** (auth, password reset, invite accept, financial operations).

```ts
const strategy = new HandleStateStrategy({
    store: new WfStateStoreMemory(), // in-memory for dev; implement WfStateStore for production
    defaultTtl: 3600_000,
});

const handle = await strategy.persist(result.state);
const state = await strategy.consume(handle);  // atomic retrieve + delete (single-use)
```

#### Security note — token replay

A workflow resumption token lets the holder re-execute the workflow from the
paused step. Any token that stays valid after use is a replay vector for
whoever can copy it (browser history, logs, proxies, shared devices).

- `HandleStateStrategy.consume()` atomically deletes the handle — truly
  single-use, race-safe via the store's `getAndDelete`.
- `EncapsulatedStateStrategy.consume()` is a stateless no-op. A copy of the
  token remains valid for the full TTL. This strategy CANNOT enforce
  single-use.

**Use `EncapsulatedStateStrategy` only when every step is idempotent and the
flow carries no security impact.** For anything else — credential changes,
financial actions, account provisioning, anything with real-world side
effects — use `HandleStateStrategy` backed by a durable `WfStateStore`.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/mavrik/code/prostojs/wf
git add README.md
git commit -m "docs: document state strategy security tradeoffs in README"
```

---

### Task 4: Release `@prostojs/wf`

**Files:**
- Modify: `/Users/mavrik/code/prostojs/wf/package.json` (bump version)
- Auto-generated: `/Users/mavrik/code/prostojs/wf/CHANGELOG.md`

- [ ] **Step 1: Inspect release script to confirm procedure**

Run: `cat /Users/mavrik/code/prostojs/wf/scripts/release.js | head -80`
Expected: confirms the script prompts for version bump, runs build/test/lint, then publishes.

- [ ] **Step 2: Run the release script**

Run: `cd /Users/mavrik/code/prostojs/wf && pnpm release`

When prompted for new version, choose **minor bump** (`0.1.1` → `0.2.0`) — this is an additive, non-breaking interface change.

Expected output: build succeeds, tests pass, `0.2.0` published to npm, commit tagged `v0.2.0`, pushed.

- [ ] **Step 3: Verify publish**

Run: `npm view @prostojs/wf version`
Expected: `0.2.0`

**STOP HERE. Do not start Phase 2 until `@prostojs/wf@0.2.0` is successfully published and reachable from npm.**

---

## Phase 2 — `@wooksjs/event-wf`: trigger fix + built-in outlets + tests

**Working directory for Phase 2:** `/Users/mavrik/code/wooksjs`

### Task 5: Bump `@prostojs/wf` dep in `event-wf`

**Files:**
- Modify: `/Users/mavrik/code/wooksjs/packages/event-wf/package.json`

- [ ] **Step 1: Update the dependency version**

Open `packages/event-wf/package.json` and locate the `"@prostojs/wf"` entry under `dependencies` or `peerDependencies`. Bump its version range to `^0.2.0`.

Run: `grep -n '@prostojs/wf' /Users/mavrik/code/wooksjs/packages/event-wf/package.json`

Expected: one or more lines; edit each to `"^0.2.0"`.

- [ ] **Step 2: Wait for npm propagation, then install**

Run a hard poll to ensure `@prostojs/wf@0.2.0` is actually reachable from npm before installing (prevents a silently cached older version from satisfying the dep):

```bash
until npm view @prostojs/wf@0.2.0 version 2>/dev/null | grep -q 0.2.0; do
  echo "waiting for @prostojs/wf@0.2.0 to propagate…"
  sleep 5
done
cd /Users/mavrik/code/wooksjs && pnpm install
```

Expected: poll exits within seconds after Task 4 finished; lockfile updates; `@prostojs/wf@0.2.0` installed in `packages/event-wf/node_modules/@prostojs/`.

- [ ] **Step 3: Verify `tokenDelivery` field is exported in types**

Run: `grep -n tokenDelivery /Users/mavrik/code/wooksjs/packages/event-wf/node_modules/@prostojs/wf/dist/outlets/index.d.mts`
Expected: field appears in `WfOutlet` interface definition.

- [ ] **Step 4: Run existing tests to confirm no regression from dep bump alone**

Run: `cd /Users/mavrik/code/wooksjs && pnpm vitest run packages/event-wf`
Expected: all existing tests still pass (no logic changed yet; only dep version).

- [ ] **Step 5: Commit**

```bash
cd /Users/mavrik/code/wooksjs
git add packages/event-wf/package.json pnpm-lock.yaml
git commit -m "chore(event-wf): bump @prostojs/wf to ^0.2.0"
```

---

### Task 6: Declare `tokenDelivery` on built-in outlets (TDD)

**Files:**
- Test: `/Users/mavrik/code/wooksjs/packages/event-wf/src/outlets/outlets.spec.ts`
- Modify: `/Users/mavrik/code/wooksjs/packages/event-wf/src/outlets/create-outlet.ts`

- [ ] **Step 1: Add failing tests**

Open `packages/event-wf/src/outlets/outlets.spec.ts`. Locate the `describe('createHttpOutlet', () => { ... })` block (around line 151) and append the following inside it, right before its closing `})`:

```ts
  it('declares tokenDelivery: "caller"', () => {
    const outlet = createHttpOutlet()
    expect(outlet.tokenDelivery).toBe('caller')
  })
```

Then locate the `describe('createEmailOutlet', () => { ... })` block (around line 182) and append this inside it, right before its closing `})`:

```ts
  it('declares tokenDelivery: "out-of-band"', () => {
    const outlet = createEmailOutlet(vi.fn().mockResolvedValue(undefined))
    expect(outlet.tokenDelivery).toBe('out-of-band')
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd /Users/mavrik/code/wooksjs && pnpm vitest run packages/event-wf/src/outlets/outlets.spec.ts -t "declares tokenDelivery"`
Expected: 2 FAIL — `expect(outlet.tokenDelivery).toBe('caller')` / `'out-of-band'` — received `undefined`.

- [ ] **Step 3: Implement on built-in outlets**

Edit `packages/event-wf/src/outlets/create-outlet.ts`. In `createHttpOutlet` (at the return object) add `tokenDelivery: 'caller'`:

```ts
  return {
    name: 'http',
    tokenDelivery: 'caller',
    async deliver(request: WfOutletRequest, _token: string): Promise<WfOutletResult> {
      const body = opts?.transform
        ? opts.transform(request.payload, request.context)
        : typeof request.payload === 'object' && request.payload !== null
          ? { ...(request.payload as Record<string, unknown>), ...request.context }
          : request.payload
      return { response: body }
    },
  }
```

And in `createEmailOutlet` add `tokenDelivery: 'out-of-band'`:

```ts
  return {
    name: 'email',
    tokenDelivery: 'out-of-band',
    async deliver(request: WfOutletRequest, token: string): Promise<WfOutletResult> {
      await send({
        target: request.target ?? '',
        template: request.template ?? '',
        context: request.context ?? {},
        token,
      })
      return { response: { sent: true, outlet: 'email' } }
    },
  }
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `cd /Users/mavrik/code/wooksjs && pnpm vitest run packages/event-wf/src/outlets/outlets.spec.ts`
Expected: all tests in file pass including the two new ones.

- [ ] **Step 5: Commit**

```bash
cd /Users/mavrik/code/wooksjs
git add packages/event-wf/src/outlets/create-outlet.ts packages/event-wf/src/outlets/outlets.spec.ts
git commit -m "feat(event-wf): declare tokenDelivery on built-in outlets"
```

---

### Task 7: Gate response-body merge and cookie write on `tokenDelivery` (TDD)

**Files:**
- Test: `/Users/mavrik/code/wooksjs/packages/event-wf/src/outlets/outlets.spec.ts`
- Modify: `/Users/mavrik/code/wooksjs/packages/event-wf/src/outlets/trigger.ts`

- [ ] **Step 1: Ensure `useResponse` is imported in the spec file**

Open `packages/event-wf/src/outlets/outlets.spec.ts`. At the top of the file, add `useResponse` to the existing `@wooksjs/event-http` import if it's not already there:

```ts
import { prepareTestHttpContext, useResponse } from '@wooksjs/event-http'
```

Confirm with: `grep -n "useResponse" /Users/mavrik/code/wooksjs/packages/event-wf/src/outlets/outlets.spec.ts`.

- [ ] **Step 2: Add failing tests**

In the same file, locate the `describe('handleWfOutletRequest', () => { ... })` block (around line 205) and append the following tests inside it, right before its closing `})`:

```ts
  it('does NOT merge token into body for out-of-band outlet', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig()

    const runCtx = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'with-email-outlet' }),
    })

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
    expect(result).toEqual({ sent: true, outlet: 'email' })
    expect(result.wfs).toBeUndefined()
  })

  it('does NOT set cookie for out-of-band outlet when tokenWrite="cookie"', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const emailSendFn = vi.fn().mockResolvedValue(undefined)
    const config = makeConfig({
      outlets: [createHttpOutlet(), createEmailOutlet(emailSendFn)],
      token: { write: 'cookie' },
    })

    const runCtx = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'with-email-outlet' }),
    })

    // Inspect cookies WITHIN the HTTP context (useResponse requires it), AFTER
    // the handler has run. HttpResponse stores pending cookies in the protected
    // `_cookies: Record<string, TSetCookieData>` field (see
    // packages/event-http/src/response/http-response.ts:61) — they are only
    // flushed into headers during send(), which the test harness does not
    // invoke. Access via `(resp as any)._cookies`.
    let cookieRecord: Record<string, unknown> = {}
    const result = await runCtx(async () => {
      const r = await handleWfOutletRequest(config, deps)
      const resp = useResponse()
      cookieRecord = { ...((resp as any)._cookies ?? {}) }
      return r
    })

    expect(result).toEqual({ sent: true, outlet: 'email' })
    expect(cookieRecord.wfs).toBeUndefined()
  })

  it('DOES set cookie for caller outlet when tokenWrite="cookie" (regression)', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const config = makeConfig({ token: { write: 'cookie' } })

    const runCtx = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'with-http-outlet' }),
    })

    let cookieRecord: Record<string, unknown> = {}
    const result = (await runCtx(async () => {
      const r = await handleWfOutletRequest(config, deps)
      const resp = useResponse()
      cookieRecord = { ...((resp as any)._cookies ?? {}) }
      return r
    })) as any

    expect(result.fields).toEqual(['email', 'password'])
    // Body should NOT contain wfs because tokenWrite='cookie'.
    expect(result.wfs).toBeUndefined()
    // Cookie SHOULD contain wfs because caller tokenDelivery allows it.
    expect(cookieRecord.wfs).toBeDefined()
  })

  // --- Custom-outlet tests: verify the gate is keyed on tokenDelivery (the
  // declared policy), not on the outlet NAME. A name-based implementation
  // (e.g. `outlet === 'email'`) would still pass the email-specific tests
  // above, so these lock down the behavior for third-party outlets.

  it('custom out-of-band outlet with default body-write: token not merged into body', async () => {
    const customOutOfBand: WfOutlet = {
      name: 'sms',
      tokenDelivery: 'out-of-band',
      async deliver(_req, _token) {
        return { response: { dispatched: 'sms' } }
      },
    }
    const customApp = createWfApp()
    customApp.step('await-sms', {
      handler: () => {
        const { input } = useWfState()
        if (input()) { return }
        return outlet('sms', { target: '+1555' })
      },
    })
    customApp.flow('sms-flow', ['await-sms'])

    const deps: WfOutletTriggerDeps = {
      start: (schemaId, ctx, opts) => customApp.start(schemaId, ctx as any, opts as any),
      resume: (state, opts) => customApp.resume(state as any, opts as any),
    }
    // Default token.write = 'body'. The body-merge gate must suppress wfs.
    const config: WfOutletTriggerConfig = {
      state: createTestStrategy(),
      outlets: [customOutOfBand],
    }

    const runCtx = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'sms-flow' }),
    })

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
    expect(result).toEqual({ dispatched: 'sms' })
    expect(result.wfs).toBeUndefined()
  })

  it('custom out-of-band outlet with cookie-write: token not set in cookie', async () => {
    const customOutOfBand: WfOutlet = {
      name: 'sms',
      tokenDelivery: 'out-of-band',
      async deliver(_req, _token) {
        return { response: { dispatched: 'sms' } }
      },
    }
    const customApp = createWfApp()
    customApp.step('await-sms', {
      handler: () => {
        const { input } = useWfState()
        if (input()) { return }
        return outlet('sms', { target: '+1555' })
      },
    })
    customApp.flow('sms-flow', ['await-sms'])

    const deps: WfOutletTriggerDeps = {
      start: (schemaId, ctx, opts) => customApp.start(schemaId, ctx as any, opts as any),
      resume: (state, opts) => customApp.resume(state as any, opts as any),
    }
    const config: WfOutletTriggerConfig = {
      state: createTestStrategy(),
      outlets: [customOutOfBand],
      token: { write: 'cookie' },
    }

    const runCtx = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'sms-flow' }),
    })

    let cookieRecord: Record<string, unknown> = {}
    const result = (await runCtx(async () => {
      const r = await handleWfOutletRequest(config, deps)
      const resp = useResponse()
      cookieRecord = { ...((resp as any)._cookies ?? {}) }
      return r
    })) as any

    expect(result).toEqual({ dispatched: 'sms' })
    expect(cookieRecord.wfs).toBeUndefined()
  })

  it('custom outlet without tokenDelivery defaults to caller (merges into body)', async () => {
    const customDefault: WfOutlet = {
      name: 'custom-form',
      // tokenDelivery intentionally omitted — default behavior is 'caller'.
      async deliver(req, _token) {
        return { response: { form: (req as any).payload } }
      },
    }
    const customApp = createWfApp()
    customApp.step('custom-pause', {
      handler: () => {
        const { input } = useWfState()
        if (input()) { return }
        return outlet('custom-form', { payload: { fields: ['x'] } })
      },
    })
    customApp.flow('custom-flow', ['custom-pause'])

    const deps: WfOutletTriggerDeps = {
      start: (schemaId, ctx, opts) => customApp.start(schemaId, ctx as any, opts as any),
      resume: (state, opts) => customApp.resume(state as any, opts as any),
    }
    const config: WfOutletTriggerConfig = {
      state: createTestStrategy(),
      outlets: [customDefault],
    }

    const runCtx = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'custom-flow' }),
    })

    const result = (await runCtx(() => handleWfOutletRequest(config, deps))) as any
    expect(result.form).toEqual({ fields: ['x'] })
    expect(typeof result.wfs).toBe('string')  // caller default → merged into body
  })
```

**Note on imports for these tests:** the `outlet()` helper is needed — ensure `outlet` is imported from `@prostojs/wf/outlets` at the top of the spec file (already present in the existing import line `import { HandleStateStrategy, WfStateStoreMemory, outletEmail, outletHttp } from '@prostojs/wf/outlets'` — add `outlet` to that list). `WfOutlet` needs importing as a type — add to `import type { WfStateStrategy } from '@prostojs/wf/outlets'` so it becomes `import type { WfOutlet, WfStateStrategy } from '@prostojs/wf/outlets'`.

- [ ] **Step 3: Run tests to confirm they fail**

Run: `cd /Users/mavrik/code/wooksjs && pnpm vitest run packages/event-wf/src/outlets/outlets.spec.ts -t "out-of-band|caller outlet|cookie|tokenDelivery|custom"`
Expected:
- "does NOT merge token into body for out-of-band outlet" → FAIL (body currently contains `wfs`).
- "does NOT set cookie for out-of-band outlet when tokenWrite=..." → FAIL (`_cookies.wfs` currently populated).
- "DOES set cookie for caller outlet..." → PASS already (current behavior sets cookie for all outlets including HTTP).
- "custom out-of-band outlet with default body-write..." → FAIL (custom outlet currently has body merged).
- "custom out-of-band outlet with cookie-write..." → FAIL (custom outlet currently has cookie set).
- "custom outlet without tokenDelivery defaults to caller..." → PASS already (current behavior merges body for all outlets).

- [ ] **Step 4: Implement the gates in trigger.ts**

Edit `packages/event-wf/src/outlets/trigger.ts`. Locate the block:

```ts
    if (tokenWrite === 'cookie') {
      response.setCookie(tokenName, newToken, {
        httpOnly: true,
        sameSite: 'Strict',
        path: '/',
      })
    }

    const result = await outletHandler.deliver(outletReq, newToken)

    if (
      tokenWrite === 'body' &&
      result?.response &&
      typeof result.response === 'object'
    ) {
      return { ...(result.response as Record<string, unknown>), [tokenName]: newToken }
    }

    return result?.response ?? { waiting: true }
```

Replace with:

```ts
    const outOfBand = outletHandler.tokenDelivery === 'out-of-band'

    if (tokenWrite === 'cookie' && !outOfBand) {
      response.setCookie(tokenName, newToken, {
        httpOnly: true,
        sameSite: 'Strict',
        path: '/',
      })
    }

    const result = await outletHandler.deliver(outletReq, newToken)

    if (
      tokenWrite === 'body' &&
      !outOfBand &&
      result?.response &&
      typeof result.response === 'object'
    ) {
      return { ...(result.response as Record<string, unknown>), [tokenName]: newToken }
    }

    return result?.response ?? { waiting: true }
```

- [ ] **Step 5: Run tests to confirm pass**

Run: `cd /Users/mavrik/code/wooksjs && pnpm vitest run packages/event-wf/src/outlets/outlets.spec.ts`
Expected: all tests pass including the new ones. The existing test at line 255-271 ("pauses workflow with HTTP outlet and returns form + token") still passes because HTTP outlet is `caller`. The existing test at line 507-550 ("email outlet consumes token (single-use)") still passes: it uses `emailSendFn.mock.calls[0][0].token` to recover the token, not the response body.

- [ ] **Step 6: Commit**

```bash
cd /Users/mavrik/code/wooksjs
git add packages/event-wf/src/outlets/trigger.ts packages/event-wf/src/outlets/outlets.spec.ts
git commit -m "fix(event-wf): suppress token in HTTP response for out-of-band outlets"
```

---

### Task 8: Unify consume semantics — unconditional atomic consume on resume, remove config escape hatch

**Files:**
- Test: `/Users/mavrik/code/wooksjs/packages/event-wf/src/outlets/outlets.spec.ts`
- Modify: `/Users/mavrik/code/wooksjs/packages/event-wf/src/outlets/trigger.ts`
- Modify: `/Users/mavrik/code/wooksjs/packages/event-wf/src/outlets/types.ts`

- [ ] **Step 1: Add failing test — HTTP-outlet token is single-use**

Inside `describe('handleWfOutletRequest', ...)` in `outlets.spec.ts`, append:

```ts
  it('invalidates HTTP-outlet token after successful resume (single-use)', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const store = createTestStore()
    const strategy = new HandleStateStrategy({ store })
    const config = makeConfig({ state: strategy })

    // Start → pause with HTTP outlet, get token
    const runCtx1 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'with-http-outlet' }),
    })
    const startResult = (await runCtx1(() => handleWfOutletRequest(config, deps))) as any
    const token = startResult.wfs

    // Resume once with valid input → finishes
    const runCtx2 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfs: token, input: { email: 'a@b.com' } }),
    })
    const r1 = await runCtx2(() => handleWfOutletRequest(config, deps))
    expect(r1).toEqual({ finished: true })

    // Attempt to reuse the same token → should fail (consumed)
    const runCtx3 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfs: token, input: { email: 'again@b.com' } }),
    })
    const r2 = (await runCtx3(() => handleWfOutletRequest(config, deps))) as any
    expect(r2.status).toBe(400)
    expect(r2.error).toBeDefined()
  })
```

- [ ] **Step 2: Run tests to confirm the new test fails**

Run: `cd /Users/mavrik/code/wooksjs && pnpm vitest run packages/event-wf/src/outlets/outlets.spec.ts -t "invalidates HTTP-outlet token"`
Expected: FAIL. Second resume currently succeeds (HTTP outlet isn't in `DEFAULT_CONSUME_TOKEN`, so token lives until TTL).

- [ ] **Step 3: Update trigger.ts — atomic consume on resume**

Edit `packages/event-wf/src/outlets/trigger.ts`. Replace the whole resume/start block (currently lines 36-118 approximately, from `const tok = config.token ?? {}` down to and including the `} else {` missing-params check) and the `shouldConsume` / `DEFAULT_CONSUME_TOKEN` logic. The final block should read:

```ts
export async function handleWfOutletRequest(
  config: WfOutletTriggerConfig,
  deps: WfOutletTriggerDeps,
): Promise<unknown> {
  const tok = config.token ?? {}
  const tokenName = tok.name ?? 'wfs'
  const tokenRead = tok.read ?? ['body', 'query', 'cookie']
  const tokenWrite = tok.write ?? 'body'
  const wfidName = config.wfidName ?? 'wfid'

  const ctx = current()
  const registry = new Map(config.outlets.map(o => [o.name, o]))
  ctx.set(outletsRegistryKey, registry)
  ctx.set(wfFinishedKey, undefined)

  const { parseBody } = useBody()
  const { params } = useUrlParams()
  const { getCookie } = useCookies()
  const response = useResponse()
  const body = await parseBody<Record<string, unknown>>().catch(() => undefined)

  const queryParams = params()

  let token: string | undefined
  for (const source of tokenRead) {
    if (source === 'body') {
      token = body?.[tokenName] as string | undefined
    } else if (source === 'query') {
      token = queryParams.get(tokenName) ?? undefined
    } else if (source === 'cookie') {
      token = getCookie(tokenName) ?? undefined
    }
    if (token) { break }
  }

  const wfid =
    (body?.[wfidName] as string | undefined) ?? queryParams.get(wfidName) ?? undefined
  const input = body?.input

  const resolveStrategy = (id: string) =>
    typeof config.state === 'function' ? config.state(id) : config.state

  let output

  if (token) {
    // --- RESUME ---
    // Resolve strategy provisionally; we may re-resolve once we read schemaId.
    const strategy = resolveStrategy(wfid ?? '')
    ctx.set(stateStrategyKey, strategy)

    // Atomic retrieve + invalidate. Every resume calls consume() for the token.
    // HandleStateStrategy: truly race-safe (store.getAndDelete) — token becomes
    //   single-use, replay returns null.
    // EncapsulatedStateStrategy: consume() is a no-op alias for retrieve() —
    //   token remains replayable within TTL regardless. Documented in
    //   @prostojs/wf; HandleStateStrategy is required for single-use semantics.
    // NOTE: consume fires on the provisional strategy (resolved from request
    // wfid). When state.schemaId differs (per-wfid strategies below) and the
    // strategies don't share storage, the real strategy never sees a consume
    // call. Matches pre-fix behavior; documented as a known edge case.
    const state = await strategy.consume(token)
    if (!state) {
      return { error: 'Invalid or expired workflow state', status: 400 }
    }

    // Re-resolve strategy if schemaId differs from wfid (per-workflow strategies).
    if (state.schemaId !== (wfid ?? '')) {
      const realStrategy = resolveStrategy(state.schemaId)
      ctx.set(stateStrategyKey, realStrategy)
    }

    output = await deps.resume(state, { input, eventContext: ctx })
  } else if (wfid) {
    // --- START ---
    if (config.allow?.length && !config.allow.includes(wfid)) {
      return { error: `Workflow '${wfid}' is not allowed`, status: 403 }
    }
    if (config.block?.includes(wfid)) {
      return { error: `Workflow '${wfid}' is blocked`, status: 403 }
    }
    const strategy = resolveStrategy(wfid)
    ctx.set(stateStrategyKey, strategy)
    const initialContext = config.initialContext ? config.initialContext(body, wfid) : {}
    output = await deps.start(wfid, initialContext, { input, eventContext: ctx })
  } else {
    return { error: 'Missing wfs (state token) or wfid (workflow ID)', status: 400 }
  }
```

And delete the block:

```ts
const DEFAULT_CONSUME_TOKEN: Record<string, boolean> = { email: true }
```

at line 13, and the block:

```ts
  const shouldConsume = (outletName: string) => {
    if (typeof tok.consume === 'boolean') { return tok.consume }
    return (tok.consume ?? DEFAULT_CONSUME_TOKEN)[outletName] ?? false
  }
```

Also delete the pre-existing conditional consume at lines 97-101:

```ts
    const outletName = state.meta?.outlet as string | undefined
    if (outletName && shouldConsume(outletName)) {
      // Invalidate the token so it can't be reused (e.g. email magic links)
      await strategy.consume(token)
    }
```

**Note on the re-resolve branch:** when `state.schemaId !== (wfid ?? '')` and a per-workflow strategy is resolved, we've already consumed the token via the provisional strategy above. This is correct only if both resolutions point to the same underlying store. **If** `config.state` is a function that returns different strategies per workflow ID, and those strategies do NOT share storage, the token will have been consumed on the wrong store. This matches the prior code's behavior (which also called `strategy.consume` on the provisional strategy). No regression; document as a known edge case for per-wfid strategies.

- [ ] **Step 4: Remove `consume` from `WfOutletTokenConfig` and strengthen `state` docstring**

Edit `packages/event-wf/src/outlets/types.ts`. Remove the `consume` field from `WfOutletTokenConfig`:

```ts
export interface WfOutletTokenConfig {
  /** Where to read state token from incoming request (default: `['body', 'query', 'cookie']`) */
  read?: Array<'body' | 'query' | 'cookie'>
  /** Where to write state token in response (default: `'body'`) */
  write?: 'body' | 'cookie'
  /** Parameter name for state token (default: `'wfs'`) */
  name?: string
}
```

(Drop the entire `consume` field and its docstring.)

In the same file, also update the stale `token` field docstring on `WfOutletTriggerConfig` — currently `/** Token configuration (reading, writing, naming, consumption) */`. With the `consume` sub-field removed, the docstring must drop "consumption":

```ts
  /** Token configuration (reading, writing, naming) */
  token?: WfOutletTokenConfig
```

Next, strengthen the docstring on `WfOutletTriggerConfig.state` so the config constraint for the function form is explicit (currently just `/** State persistence strategy */`):

```ts
  /**
   * State persistence strategy. Either a single strategy shared by all
   * workflows, or a function that returns a strategy per workflow ID.
   *
   * **Constraint when using the function form.** The trigger resolves the
   * strategy at resume time using the `wfid` from the request. If the resume
   * request does not include `wfid` (e.g. cookie-only transport, token-only
   * body), the trigger calls `config.state('')` — meaning:
   *
   * - EITHER all strategies returned by the function must share the same
   *   underlying storage (same Redis instance, same `WfStateStore`, same
   *   encryption key), so `consume`/`retrieve` operations work regardless of
   *   which strategy instance is picked;
   * - OR every resume request must carry `wfid` so the correct strategy is
   *   always resolved.
   *
   * Violating this contract silently breaks single-use token invalidation:
   * the `consume` call runs against the wrong strategy's storage, and the
   * token remains live in the real strategy. This is a security-relevant
   * requirement, not just a performance hint.
   */
  state: WfStateStrategy | ((wfid: string) => WfStateStrategy)
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/mavrik/code/wooksjs && pnpm vitest run packages/event-wf`
Expected: all tests pass. This includes:
- the new "invalidates HTTP-outlet token after successful resume" test
- the existing "email outlet consumes token (single-use)" test (still works — unconditional consume is a superset of the previous email-only consume)
- all other existing tests (HTTP form start/resume/cookie-read still work; token-reuse wasn't attempted in those tests).

If any test uses `tok.consume` in config, update it to remove that field. Run: `grep -rn 'consume:' /Users/mavrik/code/wooksjs/packages/event-wf/src` — expect zero hits after the change.

- [ ] **Step 6: Commit**

```bash
cd /Users/mavrik/code/wooksjs
git add packages/event-wf/src/outlets/trigger.ts packages/event-wf/src/outlets/types.ts packages/event-wf/src/outlets/outlets.spec.ts
git commit -m "fix(event-wf): call strategy.consume() atomically on every resume"
```

---

### Task 9: Add BUG_REPORT.md security reproducer as integration test

**Files:**
- Test: `/Users/mavrik/code/wooksjs/packages/event-wf/src/outlets/outlets.spec.ts`

- [ ] **Step 1: Add the reproducer test**

Inside the `describe('integration: full round-trip', () => { ... })` block in `outlets.spec.ts` (around line 474), append:

```ts
  it('security: admin triggering out-of-band outlet receives no resumption token', async () => {
    // Reproduces BUG_REPORT.md: admin submits email+role, the wf dispatches an
    // email outlet, and the admin's HTTP response MUST NOT contain the wfs
    // token (which the email recipient alone should possess).
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const store = createTestStore()
    const strategy = new HandleStateStrategy({ store })
    const emailSendFn = vi.fn().mockResolvedValue(undefined)
    const config: WfOutletTriggerConfig = {
      state: strategy,
      outlets: [createHttpOutlet(), createEmailOutlet(emailSendFn)],
    }

    // Admin triggers the flow — it pauses at the email outlet.
    const run1 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'with-email-outlet' }),
    })
    const adminResponse = (await run1(() => handleWfOutletRequest(config, deps))) as any

    // Primary assertion: admin MUST NOT see a resumption token.
    expect(adminResponse.wfs).toBeUndefined()
    expect(adminResponse).toEqual({ sent: true, outlet: 'email' })

    // Sanity: the email outlet DID receive a token for its own use.
    expect(emailSendFn).toHaveBeenCalledTimes(1)
    const emailedToken = emailSendFn.mock.calls[0][0].token as string
    expect(typeof emailedToken).toBe('string')
    expect(emailedToken.length).toBeGreaterThan(0)

    // The invitee (who receives the email) can successfully resume with the
    // emailed token — only they, not the admin, should be able to.
    const run2 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfs: emailedToken, input: { email: 'verified@test.com' } }),
    })
    const inviteeResponse = await run2(() => handleWfOutletRequest(config, deps))
    expect(inviteeResponse).toEqual({ finished: true })
  })
```

- [ ] **Step 2: Run the test**

Run: `cd /Users/mavrik/code/wooksjs && pnpm vitest run packages/event-wf/src/outlets/outlets.spec.ts -t "security: admin"`
Expected: PASS. (If Task 7 and Task 8 were correctly applied, the admin's response has no `wfs` and the invitee's resume via the email token succeeds exactly once.)

- [ ] **Step 3: Commit**

```bash
cd /Users/mavrik/code/wooksjs
git add packages/event-wf/src/outlets/outlets.spec.ts
git commit -m "test(event-wf): add BUG_REPORT.md admin-replay reproducer"
```

---

### Task 10: Retriable-pause test — old token dies, new token enables retry

**Goal:** lock down the intended UX for "validation/retriable pause": when a step handler pauses again (returns outletHttp with an error context), the caller receives a **fresh** token in the response and the old token is rejected on subsequent use. This prevents a user-visible regression where a form with validation failures silently reuses a dead token, and verifies the intended "new token per pause" semantic under unconditional-consume.

**Files:**
- Modify: `/Users/mavrik/code/wooksjs/packages/event-wf/src/outlets/outlets.spec.ts`

- [ ] **Step 1: Add a retriable-pause step + flow to the test app**

Locate `function createTestWfApp()` (around line 28). Add the new step **immediately above the first `app.flow(...)` call** (currently the `app.flow('simple', ['complete'])` line), and add the new flow **immediately after the last `app.flow(...)` call** so it sits alongside the other flow registrations.

New step (place above the first `app.flow` line):

```ts
  // A step that re-pauses with an error context when input is bad — exercises
  // the "retriable pause" path: trigger consumes old token on every resume
  // and issues a fresh token on every pause, including re-pause at same step.
  app.step('validate-retry', {
    handler: () => {
      const { input } = useWfState()
      const i = input<{ password?: string }>()
      if (i?.password === 'good') { return }
      return outletHttp({ fields: ['password'] }, { error: 'bad password' })
    },
  })
```

New flow (place after the last `app.flow` line):

```ts
  app.flow('retry-flow', ['validate-retry'])
```

- [ ] **Step 2: Add the failing test**

Inside `describe('handleWfOutletRequest', () => { ... })` (around line 205), append:

```ts
  it('retriable pause: old token is single-use; new token returned for retry', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const store = createTestStore()
    const strategy = new HandleStateStrategy({ store })
    const config = makeConfig({ state: strategy })

    // Start — pause at validate-retry, receive token T1.
    const run1 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'retry-flow' }),
    })
    const r1 = (await run1(() => handleWfOutletRequest(config, deps))) as any
    expect(r1.fields).toEqual(['password'])
    const t1 = r1.wfs as string
    expect(typeof t1).toBe('string')

    // Resume with bad input — step re-pauses with error context, new token T2.
    const run2 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfs: t1, input: { password: 'wrong' } }),
    })
    const r2 = (await run2(() => handleWfOutletRequest(config, deps))) as any
    expect(r2.fields).toEqual(['password'])
    expect(r2.error).toBe('bad password')
    const t2 = r2.wfs as string
    expect(typeof t2).toBe('string')
    expect(t2).not.toBe(t1)

    // Replay T1 — must be rejected (consumed on the previous resume).
    const run3 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfs: t1, input: { password: 'good' } }),
    })
    const r3 = (await run3(() => handleWfOutletRequest(config, deps))) as any
    expect(r3.status).toBe(400)

    // Retry with T2 + good input — workflow finishes.
    const run4 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfs: t2, input: { password: 'good' } }),
    })
    const r4 = await run4(() => handleWfOutletRequest(config, deps))
    expect(r4).toEqual({ finished: true })
  })
```

- [ ] **Step 3: Run test**

Run: `cd /Users/mavrik/code/wooksjs && pnpm vitest run packages/event-wf/src/outlets/outlets.spec.ts -t "retriable pause"`
Expected: PASS. (Re-pause at the same step index is the documented engine behavior — `/Users/mavrik/code/prostojs/wf/src/workflow.ts` sets `result.interrupt = true` and breaks without advancing when a handler returns `{ inputRequired: ... }`. Combined with the Task 8 unconditional consume and per-pause persist, a fresh token is issued on every re-pause.)

- [ ] **Step 4: Add a lock-down test for "thrown error burns token (no fresh replacement)"**

This is the documented tradeoff of consume-before-resume: if the step throws an unexpected error during resume, the token is already consumed and no new token is issued — the user must restart the workflow. This is the **fail-closed** behavior (security preferred) and must not silently flip to fail-open in a future refactor.

First, add a throwing step + flow to `createTestWfApp()`. Place them next to the `validate-retry` step added in Step 1:

```ts
  // A step that throws a non-retriable error when given input — exercises the
  // "token burned on thrown error" semantic of consume-before-resume.
  app.step('throws-on-input', {
    handler: () => {
      const { input } = useWfState()
      if (input()) { throw new Error('step exploded') }
      return outletHttp({ fields: ['anything'] })
    },
  })
```

And the flow next to `retry-flow`:

```ts
  app.flow('throw-flow', ['throws-on-input'])
```

Then append this test inside `describe('handleWfOutletRequest', () => { ... })`:

```ts
  it('unexpected thrown error burns the token; replay is rejected', async () => {
    const app = createTestWfApp()
    const deps = makeDeps(app)
    const store = createTestStore()
    const strategy = new HandleStateStrategy({ store })
    const config = makeConfig({ state: strategy })

    // Start — pause at throws-on-input, receive token T1.
    const run1 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfid: 'throw-flow' }),
    })
    const r1 = (await run1(() => handleWfOutletRequest(config, deps))) as any
    const t1 = r1.wfs as string
    expect(typeof t1).toBe('string')

    // Resume with any input — step throws, trigger throws.
    // Token T1 was already consumed before resume ran (fail-closed).
    const run2 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfs: t1, input: { anything: true } }),
    })
    await expect(
      run2(() => handleWfOutletRequest(config, deps)),
    ).rejects.toThrow('step exploded')

    // Replay T1 — rejected (token is gone, burned by the prior resume attempt).
    const run3 = prepareTestHttpContext({
      url: '/wf',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ wfs: t1 }),
    })
    const r3 = (await run3(() => handleWfOutletRequest(config, deps))) as any
    expect(r3.status).toBe(400)

    // Store confirms the handle was deleted atomically on consume.
    expect(await store.get(t1)).toBeNull()
  })
```

- [ ] **Step 5: Run both Task 10 tests together**

Run: `cd /Users/mavrik/code/wooksjs && pnpm vitest run packages/event-wf/src/outlets/outlets.spec.ts -t "retriable pause|thrown error"`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/mavrik/code/wooksjs
git add packages/event-wf/src/outlets/outlets.spec.ts
git commit -m "test(event-wf): lock down resume semantics (retriable pause + token burn on throw)"
```

---

## Phase 3 — wooksjs vitepress docs + AI-agent skill

**Working directory for Phase 3:** `/Users/mavrik/code/wooksjs`

Both deliverables in this phase must ship with the same release as the code change (Phase 2) — stale docs about `token.consume` or misleading claims about encapsulated strategy would actively mislead anyone picking up the new version.

### Task 11: Update `docs/wf/outlets.md` (vitepress)

**Files:**
- Modify: `/Users/mavrik/code/wooksjs/docs/wf/outlets.md`

- [ ] **Step 1: Update the overview blurb**

Find line 5 (current text: `"The outlet system handles state persistence, token generation, token consumption (single-use for email, reusable for HTTP), and HTTP response building — so your step handlers stay declarative."`) and replace the parenthetical to reflect the new semantics:

```markdown
The outlet system handles state persistence, token generation, atomic `consume()` on every resume with a fresh token issued on every pause (truly single-use with `HandleStateStrategy`), and HTTP response building — so your step handlers stay declarative.
```

- [ ] **Step 2: Update the `WfOutletTriggerConfig` interface example**

Find the code fence that starts with `interface WfOutletTriggerConfig {` (text anchor — don't rely on line numbers). Remove the `consume` line and surface the per-wfid `state` constraint as an inline comment. The block should end up as:

```ts
interface WfOutletTriggerConfig {
  /**
   * When `state` is a function (per-wfid strategies), all strategies it
   * returns MUST share underlying storage, OR every resume request MUST
   * include `wfid`. Otherwise `consume()` runs against the wrong strategy
   * and single-use invalidation breaks silently.
   */
  state: WfStateStrategy | ((wfid: string) => WfStateStrategy)
  outlets: WfOutlet[]
  token?: {
    name?: string                              // default: 'wfs'
    read?: Array<'body' | 'query' | 'cookie'>  // default: ['body', 'query', 'cookie']
    write?: 'body' | 'cookie'                  // default: 'body'
  }
  wfidName?: string                            // default: 'wfid'
  allow?: string[]
  block?: string[]
  initialContext?: (body, wfid) => unknown
  onFinished?: (ctx: { context, schemaId }) => unknown
}
```

- [ ] **Step 3: Replace the "State Strategies" section with security-honest content**

Find the `### State Strategies` section (starts around line 206). Replace its entire body (from `### State Strategies` heading through the end of the `EncapsulatedStateStrategy` example, line 234) with:

````markdown
### State Strategies

State strategies control how workflow state is persisted between pause and resume. **Choose based on whether the workflow is security-sensitive** — see the security note below.

**`HandleStateStrategy`** — server-side storage with a short opaque handle as token. Supports truly single-use tokens via atomic `getAndDelete` at the store layer. **Use this for any flow with real-world side effects** (auth, password reset, invite accept, financial operations).

```ts
import { HandleStateStrategy, WfStateStoreMemory } from '@wooksjs/event-wf'

const strategy = new HandleStateStrategy({
  store: new WfStateStoreMemory(),  // in-memory (dev/test only)
  defaultTtl: 60_000,              // 1 minute expiry
})
```

For production, implement the `WfStateStore` interface backed by Redis, a database, etc.

**`EncapsulatedStateStrategy`** — stateless, AES-256-GCM encrypted token. No server storage needed. The entire workflow state is encrypted into the token itself. **Use only for idempotent, non-sensitive flows** (multi-step forms, pure data collection).

```ts
import { EncapsulatedStateStrategy } from '@wooksjs/event-wf'

const strategy = new EncapsulatedStateStrategy({
  secret: crypto.randomBytes(32),  // 32-byte AES-256 key
  defaultTtl: 300_000,             // 5 minutes
})
```

#### Security note — token replay

A workflow resumption token lets the holder re-execute the workflow from the paused step. Any token that remains valid after use is a replay vector for whoever can copy it (browser history, logs, proxies, shared devices).

- `HandleStateStrategy.consume()` atomically deletes the handle — truly single-use and race-safe.
- `EncapsulatedStateStrategy.consume()` is a stateless no-op. A copy of the token remains valid for the full TTL. **This strategy CANNOT enforce single-use.** Use `HandleStateStrategy` when that matters.

The trigger unconditionally calls `strategy.consume()` on every resume, so with `HandleStateStrategy` every token is automatically single-use. With `EncapsulatedStateStrategy` the consume call is a no-op and the token remains replayable until TTL — safe only if every step is idempotent.
````

- [ ] **Step 4: Remove the `token.consume` subsection**

Find the subsection whose heading is `**\`token.consume\`** — controls single-use vs reusable tokens per outlet:` (the text anchor is unique; don't rely on line numbers, which will have drifted after Step 3's replacement). Delete that entire subsection — from the `**\`token.consume\`**` heading line through the paragraph ending with `"preventing replay attacks on email magic links."` — since `token.consume` no longer exists and single-use is now unconditional.

- [ ] **Step 5: Add a "Resume Semantics" subsection**

The current vitepress docs don't explain when the token dies or what happens on an unexpected throw. Insert a new `### Resume Semantics` subsection **between the State Strategies section (which ends with the "Security note — token replay" paragraphs) and the `### Token Configuration` heading** — use the `### Token Configuration` heading as the text anchor and place the new block immediately before it:

````markdown
### Resume Semantics

On every resume, the trigger calls `strategy.consume()` atomically BEFORE running the step handler. With `HandleStateStrategy` the token is truly single-use — a replay returns `{ error, status: 400 }`. With `EncapsulatedStateStrategy` `consume()` is a no-op (see the security note above) and the token remains replayable until TTL.

On pause — including a re-pause at the same step for validation retry — the trigger persists state and issues a **fresh** token; the old one is gone. So a step handler that validates input and decides to re-prompt via `outletHttp(form, { error: 'invalid' })` returns a new token in the response, and the caller retries with that one.

**Fail-closed on unexpected errors.** Because consume fires before the step runs, an unexpected throw during resume burns the token with no fresh replacement — the user must restart the workflow. This is the security-preferred behavior (no lingering replayable token after a failed attempt). Handle expected validation failures by returning an outlet signal from the step handler (the engine issues a new token on the re-pause), NOT by throwing.
````

- [ ] **Step 6: Add `tokenDelivery` to the Custom Outlets section**

Find the `### Custom Outlets` heading (text anchor). Replace the section body with:

````markdown
### Custom Outlets

Implement the `WfOutlet` interface directly:

```ts
import type { WfOutlet } from '@wooksjs/event-wf'

const smsOutlet: WfOutlet = {
  name: 'sms',
  tokenDelivery: 'out-of-band',  // SMS recipient is not the HTTP caller
  async deliver(request, token) {
    await smsService.send(request.target!, `Your code: ${token}`)
    return { response: { sent: true } }
  },
}
```

#### `tokenDelivery`

Declares how the resumption token reaches the resumer. This is a **security-critical** field — get it wrong and the HTTP caller who triggered the pause will receive the token intended for a different principal.

- `'caller'` (default) — the HTTP caller IS the resumer. The trigger merges the token into the HTTP response body or `Set-Cookie` per `token.write`. Appropriate for multi-step HTTP forms.
- `'out-of-band'` — the outlet delivers the token through its own channel (email, SMS, Slack message, webhook). The HTTP caller is a bystander. The trigger suppresses body merge and cookie write so the caller receives no token.

Built-in outlets: `createHttpOutlet()` declares `'caller'`; `createEmailOutlet()` declares `'out-of-band'`. Any custom outlet whose resumer is a different principal than the HTTP caller MUST declare `'out-of-band'`.
````

- [ ] **Step 7: Run vitepress build to catch broken references**

Run: `cd /Users/mavrik/code/wooksjs && pnpm docs-build`
Expected: clean vitepress build. Any failure (broken link, syntax error in a code fence) is a real bug — do not suppress. The root `docs-build` script is `vitepress build docs` (see `/Users/mavrik/code/wooksjs/package.json`).

- [ ] **Step 8: Commit**

```bash
cd /Users/mavrik/code/wooksjs
git add docs/wf/outlets.md
git commit -m "docs(wf): update outlets docs for tokenDelivery and replay-safe consume"
```

---

### Task 12: Update `skills/wooksjs/references/wf-outlets.md` (AI agent skill)

**Files:**
- Modify: `/Users/mavrik/code/wooksjs/skills/wooksjs/references/wf-outlets.md`

- [ ] **Step 1: Update the `WfStateStrategy` interface block and strategy descriptions**

Find the `## State Strategies` section (around line 136). Replace its body through the end of the `HandleStateStrategy` example (around line 174) with:

````markdown
## State Strategies

Persist workflow state between pause and resume.

```ts
interface WfStateStrategy {
  persist(state: WfState, options?: { ttl?: number }): Promise<string>
  retrieve(token: string): Promise<WfState | null>          // NO invalidation
  consume(token: string): Promise<WfState | null>           // atomic retrieve + invalidate
}
```

The outlet trigger calls `consume()` on every resume regardless of outlet type — but `consume()` is only truly invalidating when the strategy has server-side state to delete. Tokens are thus single-use with `HandleStateStrategy` and replayable-within-TTL with `EncapsulatedStateStrategy`. See the security warning below.

### HandleStateStrategy

Stores state server-side with an opaque handle token. Supports truly single-use tokens via the store's atomic `getAndDelete`. **Required for security-sensitive flows** (auth, password reset, invite accept, financial operations).

```ts
import { HandleStateStrategy, WfStateStoreMemory } from '@wooksjs/event-wf'

const strategy = new HandleStateStrategy({
  store: new WfStateStoreMemory(),  // or custom WfStateStore implementation
  defaultTtl: 3600_000,
  generateHandle: () => crypto.randomUUID(), // optional
})
```

### EncapsulatedStateStrategy

Encrypts state into the token itself (no server-side storage). **Stateless — cannot enforce single-use: `consume()` is a no-op alias for `retrieve()`, so a copy of the token remains valid for the full TTL regardless of consume calls.** Use only for idempotent, non-sensitive flows.

```ts
import { EncapsulatedStateStrategy } from '@wooksjs/event-wf'

const strategy = new EncapsulatedStateStrategy({
  secret: process.env.WF_SECRET,  // string | Buffer (32 bytes)
  defaultTtl: 3600_000,           // optional, ms
})
```

**Selection rule.** If the flow has any real-world side effect (auth, credentials, money, permissions), use `HandleStateStrategy`. Use `EncapsulatedStateStrategy` only when every step is idempotent and replay-within-TTL is harmless.
````

- [ ] **Step 2: Strengthen the `WfOutletTriggerConfig` block**

Find the `## WfOutletTriggerConfig` heading (text anchor; line numbers have drifted after Step 1's replacement). Replace the code fence that follows it with:

````markdown
## WfOutletTriggerConfig

```ts
interface WfOutletTriggerConfig {
  /**
   * State persistence strategy. When using the function form (per-wfid
   * strategies), all returned strategies MUST share underlying storage,
   * OR every resume request MUST include `wfid` so the correct strategy
   * is resolved. Otherwise `consume()` runs against the wrong storage and
   * the token silently remains live — breaking single-use invalidation.
   */
  state: WfStateStrategy | ((wfid: string) => WfStateStrategy)
  outlets: WfOutlet[]
  allow?: string[]              // whitelist of allowed workflow IDs
  block?: string[]              // blacklist (checked after allow)
  token?: WfOutletTokenConfig
  wfidName?: string             // param name for workflow ID (default: 'wfid')
  initialContext?: (body: Record<string, unknown> | undefined, wfid: string) => unknown
  onFinished?: (ctx: { context: unknown; schemaId: string }) => unknown
}
```
````

- [ ] **Step 3: Remove `consume` from `WfOutletTokenConfig`**

Find the `## WfOutletTokenConfig` heading (text anchor). Replace the heading and its body (through the closing of the `interface WfOutletTokenConfig` code fence) with:

````markdown
## WfOutletTokenConfig

Controls how state tokens are read from requests and written to responses. Single-use invalidation is not configurable — the trigger consumes on every resume. For out-of-band outlets (email, SMS, etc.), the token is NOT written to the HTTP response (body or cookie is suppressed) so the HTTP caller cannot replay it; this is controlled by the outlet's `tokenDelivery` field, not this config.

```ts
interface WfOutletTokenConfig {
  read?: Array<'body' | 'query' | 'cookie'>   // default: ['body', 'query', 'cookie']
  write?: 'body' | 'cookie'                   // default: 'body'
  name?: string                                // token param name (default: 'wfs')
}
```
````

- [ ] **Step 4: Update "Trigger Request Flow" to reflect atomic consume**

Find the `## Trigger Request Flow` heading (text anchor). Replace its body (the paragraphs between this heading and the next `##` heading) with:

```markdown
The trigger reads `wfs` (state token) and `wfid` (workflow ID) from body, query params, or cookies per `token.read` config.

- If `wfs` is present: **resume** — the trigger calls `strategy.consume(token)` (atomic retrieve + invalidate) BEFORE running the step. Replay of the same `wfs` returns `{ error, status: 400 }`. With `HandleStateStrategy` the token is truly deleted; with `EncapsulatedStateStrategy` the consume is a stateless no-op and the token remains replayable until TTL (use `HandleStateStrategy` when that matters).
- If `wfid` is present (no `wfs`): **start** — creates initial context, starts workflow.
- If neither: returns `{ error: '...', status: 400 }`.

On pause, the trigger persists state and issues a **fresh** token, dispatches to the outlet, and returns the outlet's response. The token is merged into the response (body or cookie per `token.write`) only if the outlet declares `tokenDelivery: 'caller'` (the default for HTTP outlets). For `tokenDelivery: 'out-of-band'` outlets (email, SMS, etc.), the response does NOT contain the token — the outlet delivers it through its own channel.

On finish, the trigger checks `onFinished` callback, then `useWfFinished()`, then returns `{ finished: true }`.

**Fail-closed on unexpected errors.** Because consume fires BEFORE the step runs, an unexpected throw during resume burns the token with no fresh replacement — the user must restart the workflow. This is the security-preferred behavior (no lingering replayable token after a failed attempt). Handle expected validation failures by returning an outlet signal from the step handler (the engine issues a new token on the re-pause), not by throwing.
```

- [ ] **Step 5: Add a `tokenDelivery` section under Creating Outlets**

Find `## Creating Outlets` (text anchor). After the end of the `### Email outlet` subsection (the paragraph ending `"The send function receives { target, template, context, token }."`), insert a new `###` subsection. The skill's top-level table of contents lists only `##` entries, not `###`, so this addition does not require a TOC update.

````markdown
### Custom outlets — `tokenDelivery`

Implement the `WfOutlet` interface for custom delivery channels (SMS, Slack, webhook, pending-task queue, etc.). The `tokenDelivery` field is security-critical:

```ts
import type { WfOutlet } from '@wooksjs/event-wf'

const slackOutlet: WfOutlet = {
  name: 'slack',
  tokenDelivery: 'out-of-band',  // resumer is a Slack user, not the HTTP caller
  async deliver(request, token) {
    await slack.postMessage(request.target!, {
      actions: [{ url: `https://app.com/resume?wfs=${token}` }],
    })
    return { response: { sent: true } }
  },
}
```

**`tokenDelivery: 'caller'` (default)** — HTTP caller is the resumer; trigger merges token into body/cookie.

**`tokenDelivery: 'out-of-band'`** — outlet delivers the token through its own channel (recipient ≠ HTTP caller); trigger suppresses body merge and cookie write so the caller receives no token.

Built-in outlets: `createHttpOutlet()` = `'caller'`, `createEmailOutlet()` = `'out-of-band'`.

Any custom outlet whose resumer is a different principal than the HTTP caller MUST declare `'out-of-band'`, otherwise the caller receives a token they shouldn't have — a privilege escalation vector.
````

- [ ] **Step 6: Commit**

```bash
cd /Users/mavrik/code/wooksjs
git add skills/wooksjs/references/wf-outlets.md
git commit -m "docs(skills): update wooksjs skill for tokenDelivery and replay-safe consume"
```

---

### Task 13: Full test + lint + build, then release `@wooksjs/event-wf`

**Files:**
- Auto-modified: workspace `package.json` files via `scripts/versions.js`

- [ ] **Step 1: Run full verification locally**

Run in order:

```bash
cd /Users/mavrik/code/wooksjs
pnpm build
pnpm lint
pnpm test
```

Expected: all three succeed across the monorepo. If any lint error appears in files you touched, run `pnpm format` to apply fixes, re-run `pnpm lint`, and commit any formatting changes separately with `style: apply oxfmt`.

- [ ] **Step 2: Clean working tree before release**

`scripts/versions.js` (invoked by `pnpm release` via `node ./scripts/versions`) aborts on any uncommitted change — see `scripts/versions.js:29-32`:

```js
const { stdout: status } = await $`git status --porcelain`
if (status.trim() !== '') {
    info('❌ You have uncommitted changes. Please commit or stash them before releasing.')
    process.exit(1)
}
```

At this point `git status` will show:
- `BUG_REPORT.md` and `FEATURES.md` — scratch docs from the brainstorm; delete them.
- `docs/superpowers/` — untracked directory containing this plan file; commit it (useful history of the fix rationale).

Run:

```bash
cd /Users/mavrik/code/wooksjs
rm BUG_REPORT.md FEATURES.md
git add docs/superpowers/plans/2026-04-21-outlet-token-security.md
git commit -m "docs: archive implementation plan for outlet token security fix"
git status --porcelain
```

Expected: `git status --porcelain` returns empty — worktree is clean, release will proceed.

- [ ] **Step 3: Run the release**

Run: `cd /Users/mavrik/code/wooksjs && pnpm release`

The `pnpm release` target per `package.json` runs: `pnpm build && pnpm lint && pnpm test && node ./scripts/versions && pnpm publish -r --access public`.

When the version-sync step prompts, choose **patch bump** (`0.7.9` → `0.7.10`). Rationale: the wooksjs monorepo keeps all package versions synced, so a minor bump would bump every package — too noisy for a single-package security fix. Patch is also semver-correct here (this is a security fix, not a new feature). The change IS technically breaking for anyone relying on `tok.consume` (dropped) or on receiving `wfs` from email-outlet responses (intentionally removed — the security fix), but near-zero adoption makes patch acceptable per the user's explicit guidance.

Expected: all packages publish with `0.7.10`, git tag `v0.7.10`, pushed.

- [ ] **Step 4: Verify publish**

Run: `npm view @wooksjs/event-wf version`
Expected: `0.7.10` (or whatever bumped version was chosen).

- [ ] **Step 5: Confirm consumer demo works end-to-end (manual smoke test)**

Switch to `/Users/mavrik/code/atscript-ui/packages/demo`, bump its `@wooksjs/event-wf` dep to the new version, install, and run the invite flow. Expected observable change:
- Admin POSTs to start invite → receives `{sent: true, outlet: 'email'}` WITHOUT `wfs`.
- Invitee follows the magic link → resumes to the credential form successfully.
- If admin tries to replay with any `wfs` value they may have saved from before → 400.

Not blocking — if demo isn't runnable at this moment, document in commit notes and the user can test manually later.

---

## Self-Review Checklist (run after completing all tasks)

- [ ] Every claim in `BUG_REPORT.md` is covered by a concrete fix: token-in-body leak (Task 7), token-in-cookie leak (Task 7), conditional consume hard-coding (Task 8).
- [ ] Every claim in `FEATURES.md` is either implemented or deliberately simplified away: `tokenDelivery` implemented (Tasks 1, 6, 7); `singleUse` collapsed into unconditional consume (Task 8, simpler than FEATURES.md); `tok.consume` escape hatch removed entirely (Task 8, per user's "no back-compat" directive).
- [ ] Security advisory for `EncapsulatedStateStrategy` is present at five surfaces: interface docstring (Task 2), class docstring (Task 2), `@prostojs/wf` README (Task 3), wooksjs vitepress docs (Task 11), wooksjs AI-agent skill (Task 12).
- [ ] `WfOutletTriggerConfig.state` per-wfid constraint is documented at three surfaces: types.ts docstring (Task 8 Step 4), vitepress interface block (Task 11 Step 2), AI-agent skill (Task 12 Step 2). Docs-only per scope — no runtime validator.
- [ ] Every test from the new design is present: `tokenDelivery` on built-ins (Task 6, 2 tests); body-merge gate (Task 7); cookie-write gate (Task 7); **custom out-of-band outlet gate (Task 7 — sms/slack-style, not just email)**; **custom outlet with omitted `tokenDelivery` defaults to caller (Task 7)**; HTTP-outlet consume-on-resume (Task 8); BUG_REPORT reproducer (Task 9); retriable pause / fresh-token-per-pause (Task 10 Step 2); **thrown-error burns token lock-down (Task 10 Step 4)**. Existing tests for HTTP form start/resume, email consume, cookie-read still pass unchanged.
- [ ] Docs synchronized with code: `token.consume` references removed from vitepress (Task 11 Step 4) and skill (Task 12 Step 3); overview blurbs use qualified "consume on every resume; truly single-use only with `HandleStateStrategy`" phrasing (Task 11 Step 1, Task 11 Step 3, Task 12 Step 1, Task 12 Step 4); **fail-closed-on-throw behavior documented in both the vitepress Resume Semantics subsection (Task 11 Step 5) and the skill trigger-flow doc (Task 12 Step 4)**; `tokenDelivery` introduced in both (Task 11 Step 6, Task 12 Step 5); per-wfid `state` constraint surfaced in vitepress interface block as well (Task 11 Step 2).
- [ ] Stale `/** Token configuration (reading, writing, naming, consumption) */` docstring in types.ts is updated (Task 8 Step 4).
- [ ] No "TODO", "later", or placeholder code blocks anywhere in this plan.
- [ ] Cross-repo ordering is enforced: Phase 1 publishes `@prostojs/wf@0.2.0` before Phase 2 can bump the dep (Task 4 → Task 5 hard poll).
- [ ] Commit messages follow repo convention: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `style:` prefixes.
- [ ] Each task is TDD where applicable (implementation tasks); pure-docs tasks skip the test step.

## Out of scope (follow-ups if they ever matter)

- Encapsulated nonce-based revocation (would require a server-side used-nonce store; defer until a concrete flow needs it).
- `WfOutletResult.cookies` pass-through (currently ignored by the trigger; if implemented, apply the same `tokenDelivery` gate).
- Runtime enforcement of the per-wfid strategy constraint (documented only — if `config.state` is a function that returns non-shared storage AND a resume request arrives without `wfid`, nothing detects this at runtime. Acceptable per near-zero-adoption; if misuse appears, add a lazy check in the trigger that emits `console.warn` when `state.schemaId !== (wfid ?? '')` AND `config.state` is a function).
- Dev-mode `console.warn` for third-party outlets that don't declare `tokenDelivery` (no third-party outlets exist today per near-zero adoption; nudge not needed).
