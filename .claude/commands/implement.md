---
description: Execute an already-written Development Plan through implementer → architecture-review (with a fix loop) → plan-verifier → doc-writer. spec-creator and implementation-planner are run separately, by hand, before this — never invoke them from here.
argument-hint: <Development Plan text, or a path to a file containing it>
---

# /implement — run an existing plan through the pipeline's back half

You (the current session) are the **orchestrator**. `spec-creator` and
`implementation-planner` are **out of scope for this command on purpose** —
they run manually, in their own session, before `/implement` is ever
invoked. Never call either of them from here, even if the plan looks thin or
a spec seems to be missing; stop and ask the user to go run that stage
manually instead.

`test-writer` is **temporarily disabled** in this command to cut cost — not
removed from the repo, just not invoked here. If you find yourself wanting
to fix a plan-verifier gap by writing new tests, don't reach for
`implementer` to do it (that just re-adds the cost you disabled this for) —
list it as a deferred follow-up instead (see Stage 3).

## Stage 0 — Resolve the plan

`$ARGUMENTS` is either the Development Plan text pasted directly, or a path
to a file containing it — `Read` the file if it's a path. If neither is
present, stop and ask for the plan; don't call `implementation-planner`
yourself to produce one.

Note its `## Spec followed` path (if any) — `plan-verifier` needs it in
Stage 3.

## Stage 1 — Implement

Default: **one `implementer` call executes the whole plan sequentially** —
it already follows a plan's steps in order, and this avoids two agents
racing on the same working tree.

Only fan out concurrent `implementer` calls for a contiguous run of `[P]`
-tagged steps, and only if the user explicitly asked for speed over caution
this run. When you do: give each parallel call `isolation: "worktree"` (two
agents in one tree risk lockfile/config collisions even on disjoint files),
and merge the branches yourself before Stage 2.

If `implementer` reports a deviation that changed behavior (not a pure
code-bug fix), stop and tell the user the spec this plan traced back to is
now out of date before continuing.

## Stage 2 — Architecture review, with the fix loop

1. Run `architecture-reviewer`.
2. If the plan's spec has a non-empty `Untrusted inputs` section, also run
   the `security-review` skill in this same round — it covers different
   ground than architecture-reviewer, run both.
3. Verdict `approve`, or `comment` with no CRITICAL → go to Stage 3.
   `request_changes` (≥1 CRITICAL) → continue.
4. **Fix round** (max **3** per Stage-2 entry — count them):
   - `implementer` again, targeted only at the specific CRITICAL findings
     (`file:line` + the fix each one names) — not a plan re-run.
   - Re-run `architecture-reviewer` scoped to the changed files only.
   - Re-run whatever existing tests `implementer`'s own self-check already
     covers for the changed files (its step 4/4b) — there's no test-writer
     output to re-check against in this command.
   - Back to step 3.
5. Still `request_changes` after 3 rounds → stop, show the user the
   remaining CRITICAL findings, ask how to proceed. No silent 4th round.

## Stage 3 — Plan verification

Invoke `plan-verifier` with the plan, the spec path from Stage 0 (if any),
and the latest Implementation Report.

- `COMPLETE` → Stage 4.
- `INCOMPLETE`, but **every gap is a missing-test gap** (an `AC-N`/step
  whose only problem is "no test found") → expected, given `test-writer` is
  disabled here. Don't loop trying to fix it. List each one under
  `Follow-ups` in your final summary as "needs `test-writer`, run manually
  before merging" and proceed to Stage 4.
- `INCOMPLETE` with any **non-test** gap (missing code/behavior) → one
  gap-fill round: `implementer` on exactly those NOT MET items, then
  re-run `plan-verifier` once. Still incomplete after that → stop, show the
  user the Gaps table.

## Stage 4 — Document

Invoke `doc-writer` with the final Implementation Report (and the spec, if
one exists).

## Final summary to the user

Plan/spec followed, how many Stage-2 fix rounds it took,
`plan-verifier`'s final verdict, deferred test-coverage follow-ups (if any),
doc-writer's output. Remind the user that skipped tests are a debt, not a
pass — say so plainly rather than letting `COMPLETE`-with-follow-ups read as
fully done.

# Discipline

- Never invoke `spec-creator` or `implementation-planner` from this command
  — that boundary is intentional, not a gap to fill in on the user's behalf.
- Every loop has a stated cap; escalate to the user on hitting it rather
  than inventing a longer one.
- A missing-test gap from Stage 3 is a known, accepted consequence of
  disabling `test-writer` here — report it, don't hide it, but don't spin
  the fix loop on it either.
