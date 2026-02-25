# Why Workflows?

## The Problem

Consider a login flow. At first glance it seems simple — the user enters credentials, you verify them, done. But real login flows branch:

```
login → MFA → done
login → forgot password → email sent → resume from email → new password → MFA? → done
login → password expired → new password → MFA → done
```

Now try to implement this with plain code. You'll end up with something like:

```ts
if (needsMfa && !mfaCompleted) { ... }
if (passwordExpired && !newPasswordSet) { ... }
if (forgotPassword && emailSent && !resumedFromEmail) { ... }
if (forgotPassword && resumedFromEmail && newPasswordSet && needsMfa) { ... }
```

Every new branch adds more boolean flags. The flags interact in ways that are hard to reason about. Six months later, nobody remembers what combination of `passwordExpired + mfaCompleted + resumedFromEmail` actually means or which edge cases are covered.

This isn't unique to login flows. The same problem appears in:

- **Onboarding wizards** — different steps depending on user type, plan, or region
- **Checkout processes** — shipping, billing, promo codes, each with their own validation and fallback paths
- **Approval chains** — requests that bounce between reviewers, require revisions, escalate, or time out
- **Setup wizards** — conditional configuration steps where earlier choices determine later options

The common thread: **multi-step processes with conditional paths and external input**. As these grow, ad-hoc state management becomes the bottleneck — not the business logic itself, but keeping track of *where you are* and *what should happen next*.

## What Goes Wrong Without a Framework

**State becomes implicit.** Instead of a clear "you are on step 3 of 5", state is scattered across flags, session variables, and conditional checks. Debugging means reverse-engineering which combination of booleans led to the current situation.

**Adding a branch means touching everything.** A new requirement like "add phone verification after MFA for high-risk logins" means weaving new conditions into existing `if/else` chains and hoping nothing breaks.

**Pause and resume is DIY.** When a step waits for user input (email confirmation, file upload, external approval), you need to serialize state, store it somewhere, and reconstruct it on the next request — all by hand, differently every time.

**Flows aren't visible.** The actual sequence of steps exists only in the developer's head and in tangled control flow. There's no single place where you can see "this is what happens when a user logs in with an expired password."

## How Workflows Solve This

A workflow engine gives you a structured way to define steps and the order they run in. Instead of flags, you have a **schema**:

```ts
app.flow('login', [
  'authenticate',
  { condition: 'passwordExpired', steps: ['set-new-password'] },
  { condition: 'mfaEnabled', steps: ['verify-mfa'] },
  'complete-login',
])

app.flow('forgot-password', [
  'send-reset-email',
  'await-email-confirmation',       // pauses here
  'set-new-password',
  { condition: 'mfaEnabled', steps: ['verify-mfa'] },
  'complete-login',
])
```

The flow *is* the documentation. You can read it top-to-bottom and understand every path.

**State is managed for you.** The engine tracks which step you're on, holds the shared context, and knows how to pause and resume. You don't manage flags — you define steps and conditions.

**Adding a branch is local.** Need phone verification? Add a step and a condition. The rest of the flow doesn't change.

**Pause and resume is built in.** When a step needs input, the engine pauses and gives you a serializable state object. Store it however you want. Resume whenever the input arrives.

## Why String Handlers Matter

Most workflow engines require handlers to be functions defined in code. This works for static workflows, but what if you need to:

- Let non-developers configure workflow logic through an admin UI
- Store complete workflow definitions in a database
- Modify workflow behavior at runtime without redeploying

Wooks Workflows supports **string handlers** — JavaScript expressions evaluated at runtime:

```ts
app.step('apply-discount', {
  handler: 'ctx.total -= ctx.total * 0.1',
})
```

String handlers are fully serializable. You can load them from a database, build them from user input, or generate them dynamically. Combined with serializable flow schemas (which are just arrays of objects), entire workflows can be stored, versioned, and modified without touching application code.

Function handlers remain the default for complex logic, imports, and composable access. String handlers are an option for when portability and runtime configuration matter.
