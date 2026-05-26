# Change Request — Stable Token Across the Workflow

**Package:** `@wooksjs/event-wf`
**Affected file:** `packages/event-wf/src/outlets/trigger.ts`
**Severity:** UX bug with security implications (drives consumers toward `EncapsulatedStateStrategy`, which has a worse trust model).
**Status:** Proposed, not yet implemented.
**Upstream dependency:** `@prostojs/wf` — see `prostojs/wf/WF_STRATEGY.md` for the interface change this engine fix consumes.

---

## TL;DR

`HandleStateStrategy.consume(token)` deletes the resume token from the store on every read; `persist()` then mints a **fresh** handle. So every step rotates the URL token. Any time the SPA's in-memory copy of the rotated token is lost (refresh, lost connection, new device, forwarded magic link, bookmark-revisit), the URL still holds the old now-dead token → **`410 Gone`**.

The fix is to **keep the same handle for the entire workflow**: mint on start, reuse on every resume, delete on finish (or by TTL). The atomic `consume()` is still used as a brief mutex during the resume window, but re-persists under the same handle so the URL token stays live across steps.

The mechanic that enables this lives upstream in `@prostojs/wf` (an optional `{ handle }` override on `persist()`); that's specified separately. This doc covers the engine-side change.

---

## Reproduction

1. Default config: `HandleStateStrategy`, token in URL query (`?wfs=T1`).
2. Workflow pauses on a form via an HTTP outlet.
3. SPA POSTs `{ wfs: T1, input: undefined }` → engine `consume(T1)` → state X → resume → re-pauses → `persist()` mints **T2** → response body carries T2.
4. SPA caches T2 internally. **URL is not updated** — still `?wfs=T1`.
5. User refreshes the browser. SPA re-reads `?wfs=T1` (T2 is gone — page reload wipes runtime state).
6. SPA POSTs `{ wfs: T1, … }` → `consume(T1)` returns null → **`410 Gone`**.

Same failure mode for:

- Any browser refresh on any paused step (form, MFA, OTP, password set).
- "Bookmark this URL and come back tomorrow" — URL still has T1.
- Magic-link email opened twice (forwarded, multiple tabs, accidental double-click).
- **Lost connection on step 2 → user closes laptop → opens it at home → 410.**
- Network-flake auto-retry that re-submits the same `wfs`.

---

## Why this is NOT a SPA-side bug

The obvious workaround is "after each response, SPA writes the rotated token back into the URL." That fixes single-tab refresh only — not shared magic links, not bookmarks, not external URL captures, not non-SPA clients (CLI, native, mobile webviews), not the user-closes-laptop case.

The root issue is in the wire-protocol contract: the resume token is *read* with a side effect (deletion). Any "look at the current pause" must look identical to an "advance the workflow" at the HTTP layer. That conflation produces every symptom above.

---

## Why `EncapsulatedStateStrategy` is not a fix

`EncapsulatedStateStrategy.consume()` is a no-op alias for `retrieve()` — state is packed inside the token. Refresh works. But:

- **No server-side revocation.** Admin can't kill an in-progress flow.
- **No single-use semantics.** Anyone with a copy can submit twice.
- **Payload growth.** All state rides on every request.
- **Different trust model.** Security perimeter shifts to the signing key.

For any non-trivial flow, `HandleStateStrategy` is the correct default.

---

## Diagnosis

Current `packages/event-wf/src/outlets/trigger.ts`:

```ts
// trigger.ts:83 — atomic read+delete on every resume
const state = await strategy.consume(token)
if (!state) {
  response.setStatus(410)
  return { error: 'Invalid or expired workflow state' }
}
// …
output = await deps.resume(state, { input, eventContext: ctx })
// …
// trigger.ts:155 — mints a fresh handle every time
const newToken = await strategy.persist(
  stateWithMeta,
  output.expires ? { ttl: output.expires - Date.now() } : undefined,
)
```

The pattern was meant to give two guarantees:

1. **Single-use replay protection** on side-effectful steps — a leaked T1 can't be replayed because consume deletes it.
2. **Mutex during step execution** — two simultaneous tabs both calling consume can't both succeed (one gets the state, the other gets null).

Guarantee (1) is largely an illusion: the persisted workflow record itself advances after each step. After step N's side effect fires, the record is at step N+1. Replaying T1 in the *current* design returns 410, but in a "reuse handle" design it would just resume at step N+1 (where the workflow already is) — there's no way to re-execute step N. An attacker who can intercept T1 to replay it can also intercept the rotated T2 in transit; rotation adds no protection against any realistic threat model. It is theater.

Guarantee (2) is real but only needs to hold for the duration of the consume → resume → persist window (single-digit ms in the common case). Reusing the handle inside that window preserves the mutex without burning the URL token across the workflow.

---

## Fix

### Design

**The token is the workflow session. It does not rotate.**

- On **start** (no token, just `wfid`): strategy `persist()` mints a fresh handle. Returned as `wfs` to the client.
- On **resume**: strategy `consume()` reads-and-locks. After `deps.resume()` returns, strategy `persist()` re-stores under **the same handle**. The URL token remains valid.
- On **finish**: nothing re-persists. The handle stays deleted (from the resume's `consume`) — or, equivalently, the workflow record is gone.

The atomic `consume()` still acts as a mutex: two simultaneous resumes both attempt to consume; one wins, one gets 410-and-retries. After the winner re-persists under the same handle, the loser's next refresh succeeds (single-winner-with-retry, identical to today for the contended case — but now retries succeed because the handle is back).

### Engine delta

```ts
// trigger.ts, inside `if (output.inputRequired) { … }`
const sameStrategy = strategy === resolveStrategy(wfid ?? '')

const newToken = await strategy.persist(
  stateWithMeta,
  output.expires ? { ttl: output.expires - Date.now() } : undefined,
  // Reuse the incoming handle when resuming. Mint fresh on start
  // (token === undefined) or when the strategy was re-resolved.
  token && sameStrategy ? { handle: token } : undefined,
)
```

That's it. ~5 lines including the `sameStrategy` guard. No outlet comparison, no input-presence classification, no `state.meta.outlet` heuristic.

### Strategy-divergence guard

`trigger.ts:89-92` re-resolves the strategy when `state.schemaId !== wfid` (per-schema strategies). If the resolved strategy backs onto a different store, reusing the incoming handle would write into the wrong keyspace. The `sameStrategy` check skips the optimization in that case and falls back to minting fresh. This is correct: a request whose `wfid` and `state.schemaId` disagree is structurally stale anyway, and consumers using per-schema strategies are already on the edge case documented at [trigger.ts:80-82](packages/event-wf/src/outlets/trigger.ts#L80-L82).

### Concurrency, honestly

- **Sequential refreshes** (refresh → wait → refresh): fixed. T1 stays valid.
- **Bookmark / magic-link / next-day-resume / lost-connection-then-come-back**: fixed. T1 stays valid.
- **Simultaneous refreshes** (two tabs at the same instant): one wins, the other gets 410. Same as today. **But** the loser's *next* refresh succeeds because the winner re-persisted under T1. Today the loser is permanently broken — they have to start over. The new behavior is strictly better.
- **True replay attack** (T1 leaked to attacker): attacker can drive the workflow from wherever it currently is. Identical to a session-cookie compromise. Token rotation never protected against this; the rotated T2 traverses the same wire as T1.

### TTL

`output.expires` is the engine's own notion of validity. The re-persist passes `ttl: output.expires - Date.now()` exactly as today. The store's `expiresAt` is updated on every re-persist, giving sliding-TTL behavior across the workflow — the right behavior for a session token. No new config knob.

### Cleanup on finish

When `output.finished`, the engine has already called `consume(T1)` earlier in the request. T1 is deleted, the workflow is done. No re-persist on the finished path (that branch returns before reaching the persist block). Implicit cleanup; no extra code needed.

---

## Tests

Add to `packages/event-wf/src/outlets/outlets.spec.ts`:

- `URL token survives sequential refreshes (no input): same handle returned each time, original URL keeps working`
- `URL token survives a successful advance with input: same handle, state moved to next step`
- `URL token survives a retriable error: same handle, error returned in body`
- `finished workflow leaves no live token: post-finish replay returns 410`
- `start path mints a fresh handle (regression guard: not silently reusing some prior session)`
- `per-schema strategy divergence (state.schemaId !== wfid) does NOT reuse the handle (skips optimization)`
- `simultaneous resume race: one tab succeeds, the other 410s, then the 410'd tab's retry succeeds (winner restored the handle)`

Two existing tests assert the old "token rotates on advance" behavior and need to be updated:

- [outlets.spec.ts:608](packages/event-wf/src/outlets/outlets.spec.ts#L608) `retriable pause: old token is single-use; new token returned for retry` — assertion `t2 !== t1` becomes `t2 === t1`. The "old token single-use" framing is replaced by "same token continues to work."
- [outlets.spec.ts:584](packages/event-wf/src/outlets/outlets.spec.ts#L584) `invalidates HTTP-outlet token after successful resume (single-use)` — the post-finish 410 assertion still holds (handle is gone after finish), but the test name and intent change: the token isn't invalidated *on advance*, it's invalidated *on finish*.

[outlets.spec.ts:641](packages/event-wf/src/outlets/outlets.spec.ts#L641) `unexpected thrown error burns the token` is preserved as-is — uncaught engine errors should still burn the handle.

---

## Migration & backwards compatibility

- **Public API:** no change to `useWfState`, outlet definitions, or workflow schemas.
- **Strategy interface:** new optional `{ handle }` parameter on `persist()`; lands upstream in `@prostojs/wf`. Custom strategies that don't honor the hint continue to function — they'll keep rotating handles (no fix, no breakage).
- **Observable behavior change:** the `wfs` token now stays stable across a workflow run. Consumers that introspect the token (logging, debugging, analytics) will see one ID per session instead of one per step.
- **Single-use replay protection:** previously claimed at the transport layer (token rotation); now must be enforced — if needed — at the step level (idempotency keys, advance counters). Most workflows don't need it because step progression itself prevents replay (the workflow can't go backwards).

### Consumers who relied on rotation as replay protection

If any consumer was depending on `wfs` rotation to deduplicate side-effectful steps, that dependency needs to be replaced with explicit idempotency at the step body. The signature is: a step that processes payment, sends an email, or mints a credential should accept an idempotency key (e.g., from the form payload, a UUID embedded in the rendered form) and refuse to act twice for the same key. This is standard practice for HTTP-driven side effects and is more robust than transport-level rotation.

If no such consumer exists, this is purely a UX improvement with no migration burden.

---

## Release coordination

1. `@prostojs/wf` patch — adds the `{ handle }` override to the interface and to `HandleStateStrategy.persist()`.
2. `@wooksjs/event-wf` patch — bumps `@prostojs/wf` peer, applies the engine change, updates the two affected tests.

If `@wooksjs/event-wf` is released first against an older `@prostojs/wf`, the strategy will silently ignore the hint and continue rotating handles. Engine doesn't break; bug just isn't fixed yet. Either ordering is safe.

---

## Estimated impact

- **Lines changed in `@wooksjs/event-wf`:** ~5 in `trigger.ts`.
- **Tests updated:** 2 existing tests (assertion polarity flipped on token equality).
- **Tests added:** ~7 new cases.
- **Downstream consumer changes:** none mandatory. SPA / CLI clients can drop any URL-rotation workarounds. Consumers that relied on transport-level rotation for replay protection must move that protection to step bodies (see migration note).

---

## Alternatives considered

1. **SPA-side URL token rotation.** Fixes single-tab refresh only. Doesn't fix shared magic links, bookmarks, multi-device, lost-connection-and-resume.
2. **Switch to `EncapsulatedStateStrategy` everywhere.** Loses revocation, single-use, and bounded payload size. Wrong trust model for side-effectful flows.
3. **Reuse the handle only on "idempotent re-resume" (no input + same outlet).** An earlier draft of this proposal. Strictly less useful than always-reuse: it still rotates on advance, so a refresh *after* successfully submitting step N still 410s the URL token. The mental model is also harder ("which case am I in?"). The simpler design wins.
4. **Add a `delete(token)` method to the strategy and switch the trigger to `retrieve` + `delete`-on-finish.** Drops the consume-time mutex; now requires an advance-counter or step-nonce in the form payload to prevent concurrent step double-execution. Larger interface change, more surface for regression. The proposed fix preserves the mutex with one optional parameter.
