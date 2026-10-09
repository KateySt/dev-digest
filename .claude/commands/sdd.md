---
description: Run the full Spec Driven Development pipeline end-to-end — spec, plan, implement, test + architecture-review with a fix loop, verify, document — from an existing spec, a requirements prompt, and/or design references.
argument-hint: [path/to/existing-spec.md] [design ref image paths] <feature request / extra requirements text>
---

# /sdd — run the Spec Driven Development pipeline

You (the current session) are the **orchestrator**. You never write source code,
specs, or plans yourself in this command — every artifact comes from the
pipeline's own agents (`.claude/agents/README.md`). Your job is sequencing,
relaying questions between an agent and the user, and enforcing the loop caps
below so this never turns into an unbounded autonomous run.

Parse `$ARGUMENTS` for up to three kinds of input, in any combination:
- an **existing spec path** (`<module>/specs/*.md`) — if present, Stage 1 is
  skipped entirely, go straight to Stage 2 with this spec.
- **design reference(s)** — image/mockup paths, or a note that one is
  attached. Not yet a repo file → save under `docs/design/<feature>/*.png`
  first (the convention `spec-creator`/`implementation-planner` already use).
- **freeform requirements text** — the feature request, extra constraints,
  anything that isn't a path.

If none of the three is identifiable at all, ask the user directly what
they want built — don't guess a feature out of an empty argument.

## Stage 1 — Spec (skip if a spec path was given)

Invoke `spec-creator` (foreground) with the requirements text and any design
reference paths. `spec-creator` runs an interactive dialog across 6
categories and will ask clarifying questions — since it's a subagent, not the
user's direct chat partner, relay each question to the user yourself, take
the answer back with `SendMessage` to the same agent, and keep relaying until
it produces the finished spec file. Don't paraphrase its questions into your
own — pass them through; you'd otherwise risk losing the exact ambiguity it
flagged.

Stop and show the user the written spec path plus any `[NEEDS CLARIFICATION]`
lines it left open. Do not proceed to Stage 2 with an unresolved
`[NEEDS CLARIFICATION]` — that's the same rule `spec-creator` itself states in
its handoff discipline.

## Stage 2 — Plan

Invoke `implementation-planner` (foreground) with the spec path (from Stage 1
or from `$ARGUMENTS`). Pre-answer its `## Execution mode` question yourself:
**multi-agent pipeline** — that's what invoking this command means, don't
make the user answer a question this command already implies.

When the plan comes back:
1. Show the user the `## Steps` table (with its `[P]`/`[S]` tags) and the
   `Steps → AC-N` mapping against the spec's AC list. This is the cheapest
   pre-implementation gate this pipeline has (`implementation-planner.md`
   discipline) — wait for the user's go-ahead before Stage 3. Don't treat
   silence as approval.
2. If `implementation-planner` raised its own open questions/recommendations,
   relay them the same way as Stage 1 before asking for go-ahead.

## Stage 3 — Implement

Default: **one `implementer` call executes the whole plan sequentially** —
`implementer` already follows a plan's steps in order internally, and this
avoids any risk of two agents racing on the same working tree.

Only fan out concurrent `implementer` calls when the plan marks a contiguous
run of steps `[P]` **and** the user explicitly asked for speed over caution
for this run. If you do fan out:
- Give each parallel `implementer` call `isolation: "worktree"` — two agents
  editing the same working tree even on disjoint files risk lockfile/config
  collisions; a worktree per branch avoids that entirely.
- Merge the resulting branches yourself before Stage 4; don't hand
  `architecture-reviewer`/`test-writer` a scattered set of unmerged branches.

If `implementer`'s report flags a deviation that changed behavior (not a
pure code-bug fix), stop and tell the user the spec is now out of date before
continuing — don't silently carry a stale spec into Stage 4.

## Stage 4 — Test + Architecture Review, with the fix loop

1. Run `test-writer` and `architecture-reviewer` **in parallel** (one message,
   two `Agent` calls) against the implemented code.
2. If the spec's `Untrusted inputs` section is non-empty, also run the
   `security-review` skill in this same round (`.claude/agents/README.md`'s
   pipeline note) — it and `architecture-reviewer` cover different ground,
   run both, don't substitute one for the other.
3. Read `architecture-reviewer`'s verdict:
   - `approve`, or `comment` with no CRITICAL → loop ends, go to Stage 5.
   - `request_changes` (≥1 CRITICAL) → continue to 4.
4. **Fix round** (max **3** per Stage-4 entry — count them):
   - Invoke `implementer` again with a **targeted** task: only the specific
     CRITICAL findings (`file:line` + the fix each finding names), not the
     whole plan re-run.
   - Re-run `architecture-reviewer` scoped to the changed files only (not the
     whole diff again).
   - Re-run only the `test-writer`-written tests that touch the changed
     files — don't trust tests written in parallel against code that just
     changed, and don't re-run the full suite here either (that's
     `plan-verifier`'s job).
   - Go back to step 3.
5. **If still `request_changes` after 3 fix rounds**, stop the loop. Do not
   attempt a 4th round silently — show the user the remaining CRITICAL
   findings and ask how to proceed (a 4th automatic round at that point is a
   sign the plan or the finding needs a human call, not more agent time).

## Stage 5 — Plan verification

Invoke `plan-verifier` (foreground) with the Development Plan, the spec (if
any), and the latest Implementation Report.

- `COMPLETE` → go to Stage 6.
- `INCOMPLETE` → one gap-fill round only: invoke `implementer` with exactly
  the NOT MET items and their stated evidence gaps, then re-run
  `plan-verifier` once. If still `INCOMPLETE` after that single round, stop
  and hand the Gaps table to the user rather than looping further.

## Stage 6 — Document

Invoke `doc-writer` with the final Implementation Report (and the spec, if
one exists) to document what shipped.

## Final summary to the user

One message covering: spec path (and whether it was new or reused), plan
path, number of fix-loop rounds Stage 4 took, `plan-verifier`'s final
verdict, and doc-writer's output. Remind the user — per `spec-creator`'s own
discipline — to commit the spec before or with the code that implements it.

# Discipline

- Every loop above has a stated cap. Never invent a longer one "just to be
  thorough" — a capped loop that escalates to the user beats an uncapped one
  that quietly burns tokens on a finding that actually needed a human
  decision.
- Never skip Stage 2's go-ahead checkpoint, even if the plan looks obviously
  right to you — that checkpoint is what catches a planning gap before
  `implementer` spends tokens executing it.
- Never substitute your own judgment for an agent's report — relay verdicts
  and findings as they came back, don't summarize a CRITICAL into something
  softer.
