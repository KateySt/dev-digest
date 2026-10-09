# semver-discipline

Skill for **API Contract Reviewer**. Flags a diff whose API change is
major-worthy but ships with no version signal.

> Canonical copy lives in `server/src/db/seed-skills.ts`
> (`SEMVER_DISCIPLINE_SKILL`) and is seeded on startup, same as this repo's
> other built-in skills. This file is the human-readable mirror.

## Body

When a diff changes a route that is part of a versioned public API (external
callers, another service, or a published client depend on it), classify the
change:

- MAJOR — a breaking change (removed/renamed/retyped field, new required
  input, removed route, changed status-code semantics).
- MINOR — purely additive (new optional field, new route, new optional query
  param).
- PATCH — behavior-preserving fix, no contract change.

Report a WARNING finding when the diff contains a MAJOR-level change but:
- nothing in the diff (PR/commit text, CHANGELOG, migration note) signals a
  version bump, AND
- there is no versioned route path (e.g. `/v2/...`) or content-negotiation
  path carrying the new shape ALONGSIDE the old one.

Do not flag MINOR/PATCH changes — this skill is only about MAJOR-worthy
changes shipped without the version signal that tells consumers to expect a
break.

### Good — major change ships behind a new version
```ts
app.get('/v2/orders/:id', async (req) => {
  return { id, total, currency }; // new shape
});
// /v1/orders/:id is untouched, still returns the old shape
```
Existing `/v1` callers are unaffected; `/v2` is opt-in. No finding — the
breaking shape is isolated behind a new version.

### Bad — breaking change lands in place, no version signal
```ts
// GET /orders/:id — same path, same "current" version
- return { id, total, currency, legacyDiscountCode };
+ return { id, total, currency }; // legacyDiscountCode silently dropped
```
Every existing caller of `/orders/:id` loses `legacyDiscountCode` with no
`/v2` path and nothing in the diff signaling a major bump. WARNING — name the
changed field and say a major version bump (or a compat shim) is expected
here.
