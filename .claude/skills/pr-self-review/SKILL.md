---
name: pr-self-review
description: "Runs the repo's own skill library against the local diff before a PR is opened, so violations get caught before they reach GitHub. Matches each touched file to the skills that actually govern it (UI skills for client/, backend/architecture skills for server/ and reviewer-core/), reviews only the matched hunks, and blocks merging if any finding is CRITICAL. Triggered automatically by the PreToolUse hook right before `gh pr create` / `git push` (see .claude/hooks/check-pr-self-review.mjs), or on request — 'self review', 'review before I open a PR', 'pre-PR check', 'can I open this PR', 'run pr self review'."
metadata:
  tags: pr-review, gate, pre-pr, self-review, ci
---

## When to use

- Forced by the `PreToolUse` hook right before `gh pr create` or `git push`
  (see `.claude/hooks/check-pr-self-review.mjs`) — the hook blocks the
  command until this skill has produced a `pass` stamp for the *current*
  diff.
- On request, any time before opening a PR — "self review", "check my
  changes before I open a PR", "can I open this PR".

## Procedure

### 1. Compute the diff

Run:

    node .claude/hooks/lib/diff-hash.mjs

This prints `{ diffHash, base, branch, defaultBranch }`. `base` is the
merge-base with the repo's default branch — use it to see the actual changed
content:

    git diff <base>...HEAD                          # committed branch changes
    git diff HEAD                                    # uncommitted/staged working-tree changes
    git status --porcelain --untracked-files=all      # + new files

Together these three are "all open changes" — the full set this skill
reviews (matches what `diff-hash.mjs` hashes, so the stamp in step 6 stays
accurate). List the changed file paths, dropping deletions and anything on
the do-not-touch list from `AGENTS.md` (`package-lock.json`,
`pnpm-lock.yaml`, `server/src/vendor/*`, `client/src/vendor/*`).

### 2. Match skills to files

Don't hardcode a mapping — read `.claude/skills/README.md`'s catalog table
for the `Scope` column as a coarse filter, then confirm each candidate with
its own `SKILL.md` "When to use" section (the `Scope` column is a
pre-filter, not the final answer):

- `client/**` → Frontend-scoped skills (`next-best-practices`,
  `react-best-practices`, `react-project-structure`, and
  `react-testing-library` for `*.test.tsx` files).
- `server/**` and `reviewer-core/**` → Backend-scoped skills
  (`fastify-best-practices`, `drizzle-orm-patterns`,
  `postgresql-table-design`, `onion-architecture`).
- Full-stack skills (`zod`, `typescript-expert`, `security`) — only when
  their own "When to use" section actually matches the touched files (e.g.
  `zod` only if a schema file changed, `security` only if routes/auth/input
  handling changed). Don't run these unconditionally — that's noise.
- `e2e/**` changes have no dedicated skill in the catalog today — skip
  matching for them rather than force-fitting an unrelated skill.

If a candidate's "When to use" section doesn't actually match the touched
files, drop it.

### 3. Review

For each matched skill, read it and review only the hunks in the files it
matched, against that skill's own rules — not the whole repo, not files
another skill already owns.

### 4. Score

Use the same taxonomy as `reviewer-core`
(`reviewer-core/src/output/to-review.ts`: `SEV_RANK`) — `CRITICAL` /
`WARNING` / `SUGGESTION`, don't invent new labels. Gate policy is `critical`
by default: any `CRITICAL` finding fails the gate (mirrors
`FAIL_ON_MIN_RANK.critical` in the same file).

### 5. Report

Print findings grouped by file → skill, each with severity, a one-line
rationale, and a concrete fix. End with a one-line verdict:

- `PASS` — no `CRITICAL` findings (`WARNING`/`SUGGESTION` are still shown,
  just non-blocking).
- `BLOCKED` — at least one `CRITICAL` finding, plus the explicit next step
  ("fix the above, then re-run pr-self-review").

### 6. Stamp the result

Write `.claude/.pr-self-review-stamp.json`:

    { "diffHash": "<diffHash from step 1>", "result": "pass" | "blocked", "at": "<ISO timestamp>" }

This file is gitignored (local-only) — it's the artifact
`.claude/hooks/check-pr-self-review.mjs` checks before allowing
`gh pr create` / `git push`. Only a `pass` stamp whose `diffHash` matches the
*current* diff satisfies the hook; editing anything afterward invalidates it,
and the hook blocks again until this skill is re-run.

### 7. Feed durable learnings into `engineering-insights`

Most runs stop at step 6 — most findings are one-off and don't belong in
`INSIGHTS.md`. Only hand off to the `engineering-insights` skill when either
is true:

- The **same violation category** from a matched skill has now fired across
  more than one self-review run (check the module's `INSIGHTS.md` and recent
  session context) — a real recurring pattern worth flagging to whoever
  works here next, not a one-off.
- A matched skill's rule turned out to be a **false positive for this
  codebase** — it doesn't actually fit how this repo does things. This is a
  `Decision` entry explaining the exception, so the next run doesn't
  re-flag it.

When either applies, follow `engineering-insights`' own procedure exactly:
route to the right module's `INSIGHTS.md` (`server/`, `client/`,
`reviewer-core/`, `e2e/`), same dated `### YYYY-MM-DD — short title` format,
same cold-read quality bar. Don't manufacture an entry just to have one —
"nothing durable this run" is a correct, common outcome.

## Bypass

`.claude/hooks/check-pr-self-review.mjs` honors
`PR_SELF_REVIEW_BYPASS=<reason>` as an emergency override. It still logs the
bypass (branch, diff hash, reason, timestamp) to
`.claude/.pr-self-review-bypass.log`, which is committed and visible in
history — don't suggest this as a routine way to skip review; it exists for
genuine emergencies and every use is traceable.
