/**
 * Skill bodies for the seeded Test Quality Reviewer / API Contract Reviewer
 * agents. Each skill's body is a directive, sharper-than-the-base-prompt rule
 * — the agent's own system prompt (seed-prompts.ts) stays general so linking/
 * unlinking these skills produces a visible before/after difference (the
 * "controlled experiment" from the product spec).
 */

export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
}

export const TEST_COVERAGE_GAPS_SKILL: SeedSkill = {
  name: 'test-coverage-gaps',
  description: 'Flag a changed function whose error/edge branch has no accompanying test.',
  type: 'rubric',
  body: `# Test coverage gaps

When a diff adds or changes a function that has more than one logical branch
(a success path plus at least one error, validation-failure, retry-exhausted,
or empty/boundary case), check whether the diff's test changes exercise EVERY
branch, not just the success path.

If a distinct branch has no test asserting its behaviour, report a WARNING
finding that:
- names the exact branch/condition that is untested (e.g. "the retries-
  exhausted path at line N"),
- cites the production code line(s) where that branch lives,
- says what a test for it would need to assert (the return value, thrown
  error, or side effect on that path).

Do not report a gap for branches that were already untested before this diff
and are unrelated to the change. A happy-path-only test suite for a function
that ONLY has a happy path is not a gap — only flag a REAL missing branch.`,
};

export const MOCK_OVERUSE_SKILL: SeedSkill = {
  name: 'mock-overuse',
  description: 'Flag tests that mock away the logic they claim to test.',
  type: 'convention',
  body: `# Mock overuse

Flag a test (WARNING) when it mocks so much of the unit under test's own
internal collaborators that the assertion would still pass even if the real
logic were broken — i.e. the test only proves "the mock was called with X",
not that X was computed correctly.

A healthy mock replaces something external to the unit under test (network,
DB, clock, filesystem) while leaving the unit's own logic real. An unhealthy
mock replaces the very computation the test claims to verify. When you flag
this, name the specific mock and what real behaviour it is hiding.`,
};

export const BREAKING_ROUTE_SIGNATURE_SKILL: SeedSkill = {
  name: 'breaking-route-signature',
  description: 'Flag a changed route whose method, path, request, or response shape breaks existing callers.',
  type: 'rubric',
  body: `# Breaking route signature

For every HTTP route that existed BEFORE this diff (not one newly added in
it), compare its method/path/request-shape/response-shape/status-codes before
vs. after. Report a CRITICAL finding for any of the following unless the diff
also keeps the old shape working (e.g. the old field is still accepted/
returned alongside the new one):

- method or path changed/removed
- a request field that used to be optional is now required, with no default
- a request field's type changed in a way that rejects previously-valid input
- a response field was renamed, removed, or changed type
- a response field that was always present became conditional/nullable
- a success or error status code changed

For each finding, state the EXACT before → after shape (field name, old type/
presence → new type/presence), not just "the response changed". A change to a
route that this same diff also introduces for the first time is never
breaking — skip it.`,
};

export const RESPONSE_SCHEMA_SKILL: SeedSkill = {
  name: 'response-schema',
  description: 'Flag response-shape changes — field type, presence, or nullability — on a route that existed before this diff.',
  type: 'rubric',
  body: `# Response schema changes

For every HTTP route that existed BEFORE this diff, compare the shape of the
data it returns field by field: type, presence (always-returned vs.
optional/nullable), and which status code carries it.

Report a CRITICAL finding when a response field:
- changes type (e.g. a \`number\` becomes a \`string\`, an object becomes an array)
- goes from always-present to optional/nullable (or the reverse, if that would
  break a caller that already handles the optional/nullable case)
- is renamed or removed with nothing filling its old key

A field that is purely ADDED — a new key nothing existing reads — is never a
response-schema violation. Only flag fields an existing caller could already
depend on.

## Good — additive, backward compatible
\`\`\`ts
// before
return { id: user.id, name: user.name };
// after
return { id: user.id, name: user.name, avatarUrl: user.avatarUrl ?? null };
\`\`\`
\`avatarUrl\` is new. Every field a caller already reads is untouched in type
and presence — nothing to flag.

## Bad — silent type change
\`\`\`ts
// before
return { id: user.id, createdAt: user.createdAt.toISOString() };
// after
return { id: user.id, createdAt: user.createdAt }; // now a Date, not a string
\`\`\`
\`createdAt\` silently changed from \`string\` to \`Date\` (serializes
differently over JSON). A caller doing \`user.createdAt.slice(0, 10)\` breaks.
CRITICAL — cite the field, the old type, the new type, and the file:line of
the change.`,
};

export const SEMVER_DISCIPLINE_SKILL: SeedSkill = {
  name: 'semver-discipline',
  description: 'Flag a diff whose API change is major-worthy but ships with no version signal.',
  type: 'rubric',
  body: `# Semver discipline

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
- there is no versioned route path (e.g. \`/v2/...\`) or content-negotiation
  path carrying the new shape ALONGSIDE the old one.

Do not flag MINOR/PATCH changes — this skill is only about MAJOR-worthy
changes shipped without the version signal that tells consumers to expect a
break.

## Good — major change ships behind a new version
\`\`\`ts
app.get('/v2/orders/:id', async (req) => {
  return { id, total, currency }; // new shape
});
// /v1/orders/:id is untouched, still returns the old shape
\`\`\`
Existing \`/v1\` callers are unaffected; \`/v2\` is opt-in. No finding — the
breaking shape is isolated behind a new version.

## Bad — breaking change lands in place, no version signal
\`\`\`ts
// GET /orders/:id — same path, same "current" version
- return { id, total, currency, legacyDiscountCode };
+ return { id, total, currency }; // legacyDiscountCode silently dropped
\`\`\`
Every existing caller of \`/orders/:id\` loses \`legacyDiscountCode\` with no
\`/v2\` path and nothing in the diff signaling a major bump. WARNING — name
the changed field and say a major version bump (or a compat shim) is expected
here.`,
};

export const DEPRECATION_POLICY_SKILL: SeedSkill = {
  name: 'deprecation-policy',
  description: 'Flag a route/field removed outright instead of being marked deprecated first.',
  type: 'rubric',
  body: `# Deprecation policy

A route or response field with real callers should not disappear in one
diff. Before removal it should go through a deprecation step: kept working,
but marked deprecated (OpenAPI \`deprecated: true\`, a \`Deprecation\`/
\`Sunset\` response header, a doc comment, or an explicit deprecation
log/metric) for at least one release before the actual removal diff.

Report a WARNING finding when a diff:
- removes a previously-existing route, or a previously-existing response
  field, with no prior deprecation marker anywhere in the codebase (this diff
  is the FIRST signal anyone gets that it's going away), AND
- offers no replacement route/field in the same diff that callers could
  already have migrated to.

Do not flag: removal of something already marked deprecated (the policy
working as intended); removal of code with zero external surface (an
internal helper, a route that never shipped).

## Good — deprecate first, remove later (two diffs)
\`\`\`ts
// diff 1 (this release): mark deprecated, keep it working
app.get('/users/:id/legacy-profile', {
  schema: { deprecated: true },
}, async (req, reply) => {
  reply.header('Deprecation', 'true');
  reply.header('Sunset', '2026-12-01');
  return legacyProfile(req.params.id);
});
\`\`\`
Callers get a signal and a sunset date before anything breaks. No finding.

## Bad — route disappears with no warning
\`\`\`ts
// before
app.get('/users/:id/legacy-profile', async (req) => legacyProfile(req.params.id));
// after
// (route deleted — no prior deprecation marker existed anywhere)
\`\`\`
Any caller still hitting \`/users/:id/legacy-profile\` gets an immediate 404
with zero notice. WARNING — name the removed route/field and recommend a
deprecation marker land first, in a separate release, before deletion.`,
};

export const SEED_SKILLS: SeedSkill[] = [
  TEST_COVERAGE_GAPS_SKILL,
  MOCK_OVERUSE_SKILL,
  BREAKING_ROUTE_SIGNATURE_SKILL,
  RESPONSE_SCHEMA_SKILL,
  SEMVER_DISCIPLINE_SKILL,
];
