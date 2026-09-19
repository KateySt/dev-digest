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

export const SEED_SKILLS: SeedSkill[] = [
  TEST_COVERAGE_GAPS_SKILL,
  MOCK_OVERUSE_SKILL,
  BREAKING_ROUTE_SIGNATURE_SKILL,
];
