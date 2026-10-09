# Spec: Eval pipeline — finding → case preview, case-set balance, CI gating, `verify:l06`
Spec ID: SPEC-09
Status: draft
Supersedes: none

Scope: the end-to-end eval pipeline as one contract, closing the gaps found in
the L06 homework review:

1. **Case preview** — "Turn into eval case" on a finding opens the Eval Case
   Editor seeded from the finding (diff preview, expected output, Run / Save /
   Cancel) instead of persisting a case on click.
2. **Scoring** — restates, in one place, how each tier scores (in-app agent
   evals, harness skill/agent/workflow evals) so AC and scoring are fixed before
   code.
3. **Agent case set** — the seeded Security Reviewer case set grows to ≥ 8 with
   a balanced `must_find` / `must_not_flag` split.
4. **CI gating** — three GitHub Actions workflows run the harness evals when
   skills, agents, or the harness itself (`CLAUDE.md`, `AGENTS.md`, `.claude/`)
   change.
5. **`verify:l06`** — one offline command that checks all of the above exist
   and pass their model-free gates.

Related specs (not superseded — this spec amends them where noted):
- In-app agent evals: [`../../server/specs/eval.md`](../../server/specs/eval.md) (SPEC-02), [`../../client/specs/agent-evals.md`](../../client/specs/agent-evals.md) (SPEC-01, client). SPEC-01 AC-2 is replaced by AC-1 – AC-9 below.
- In-app skill evals: [`../../server/specs/skill-evals.md`](../../server/specs/skill-evals.md) (SPEC-08) — target picker semantics are kept.
- Harness skill tier: [`./skill-eval-harness.md`](./skill-eval-harness.md) (SPEC-01, evals).

Design reference: the "N3 Eval Case Editor (modal)" screen and the FindingCard
`findingToSeed` behavior in the Dev Digest design artifact
(`screen_cizruns.jsx`, `findings.jsx`).

## Changelog
- 2026-10-09 — initial version, from the L06 homework review: (a) "Turn into eval case" persisted the case immediately with no preview; (b) no eval-pipeline spec committed; (c) no eval GitHub Actions — changes to `.claude/` or `CLAUDE.md` triggered nothing; (d) only 4 saved agent cases; (e) no `verify:l06` script.
- 2026-10-09 — AC-16 pinned to a concrete 8-case set (4 `must_find` / 4 `must_not_flag`) taken from the design artifact's Evals tab, replacing the earlier example defect classes.

## Problem and user
A reviewer who accepts or dismisses a finding wants to turn it into a
regression case, but today one click writes a case to the database with a diff
and expectation they never saw — a wrong hunk or a too-wide forbidden range is
only discovered later, on the Evals tab, after it has already skewed a suite
run. Separately, the maintainer of the Claude Code harness (`.claude/skills`,
`.claude/agents`, `CLAUDE.md`/`AGENTS.md`) has evals but nothing runs them on a
PR, so a regressing prompt edit merges green. The course grader needs one
command to confirm the L06 deliverables are in place.

## Goals / Non-goals
Goals
- A finding becomes an eval case only after the user previews and confirms it in the Eval Case Editor, with the option to run it first.
- Scoring rules for every eval tier are written down in one spec, with AC ids.
- The seeded agent case set has ≥ 8 cases, balanced between `must_find` and `must_not_flag`.
- Harness evals run automatically on PRs that touch the artifacts they measure, split into three workflows (skills, agents, harness/workflow tier).
- `pnpm verify:l06` (in `evals/`) verifies the L06 deliverables offline, with no model call and no Docker.

Non-goals
- No change to the scoring math itself (SPEC-02 AC-29 – AC-37 and SPEC-01-evals AC-5 – AC-9 stay as they are); this spec only references them.
- No new LLM-judged in-app scoring — the in-app scorer stays model-free.
- No running of LLM-tier harness evals in CI when no model credential secret is configured (they are skipped visibly, not failed).
- No change to the "Learn" action or Reply to author.
- No eval cases for agents other than the seeded Security Reviewer (other agents' cases come from users via the new preview flow).
- No root `package.json` / workspace tool (root `AGENTS.md` forbids one).

## User stories
- As a reviewer, I accept a finding, click "Turn into eval case", see the frozen diff hunk and the expected finding, tighten the line range, click "Run case" to see it pass, then Save — and only then does the case appear in the agent's Evals tab.
- As a reviewer, I open the preview, realize the dismissal was a mistake, click Cancel, and no case exists.
- As a harness maintainer, I weaken `.claude/agents/architecture-reviewer.md` in a PR; the "evals · agents" check runs that agent's eval and goes red.
- As a grader, I run `pnpm verify:l06` in `evals/` and get a checklist with every item green.

## Acceptance criteria (EARS)

### Case preview from a finding (client + server)
- AC-1: WHEN the user clicks "Turn into eval case" on an accepted or dismissed agent finding (after picking a target, when the agent has linked skills — SPEC-08 picker semantics), the system shall open the Eval Case Editor modal seeded from that finding and shall not create a case. (verify via: unit test — FindingCard; e2e flow 08)
- AC-2: WHEN the seeded editor opens, the server shall supply the draft via `GET /findings/:id/eval-case-draft` (optional `target_kind`, `target_id` query), returning `{ name, kind, input_diff, input_meta, expected_output, source, source_finding_id, owner_kind, owner_id }` built by the same rules as today's create (accepted → `must_find` with one expected finding; dismissed → `must_not_flag` with one forbidden location; diff frozen to the finding file's overlapping hunks; PR title/body as meta), and shall write nothing to the database. (verify via: integration test)
- AC-3: IF the draft request hits a finding that is agentless, undecided, missing, or whose target is not the agent or a skill linked to it, THEN the server shall respond with the same errors as `POST /findings/:id/eval-case` (404 / 400 `no_agent` / 400 `finding_undecided` / 400 bad target), and the client shall show the error as a toast without opening the modal. (verify via: integration test; unit test)
- AC-4: IF a case already exists for the same (finding, target), THEN the draft request shall respond 409 `{ case_id }` and the client shall mark that target "In eval set" without opening the modal (SPEC-01 AC-4 behavior kept). (verify via: integration test; unit test)
- AC-5: WHEN the seeded editor renders, the system shall show a banner "Positive case" (`must_find`) or "Negative case" (`must_not_flag`) with the assertion text — "MUST find "<title>" at <file>:<lines>" or "MUST NOT comment on <file>:<lines> (<title>)" — and the subtitle "Seeded from an accepted finding" / "Seeded from a dismissed finding". (verify via: unit test)
- AC-6: WHEN the seeded editor renders, the system shall prefill name, kind, diff (with the DiffView preview, SPEC-01 AC-47), PR meta, and the expected entries / forbidden locations from the draft, all editable; kind shall be shown but not switchable (it follows the decision). (verify via: unit test)
- AC-7: WHEN the user clicks Save in a seeded editor, the client shall call `POST /findings/:id/eval-case` with the target and the user's edited `name`, `input_diff`, `input_meta`, and `expected_output`; the server shall validate the overrides exactly like a manual create (including SPEC-02 AC-52: non-array `expected_output` → 422), persist the case with `source` = `finding_accepted` / `finding_dismissed` and `source_finding_id` set, and the client shall close the modal and show the existing confirmation (kind + link to the target's Evals tab). (verify via: integration test; unit test)
- AC-8: WHEN the user clicks "Run case" (or Save with "Run on save" on) in a seeded editor that has not been saved yet, the system shall first create the case as in AC-7, then run it via `POST /eval-cases/:id/run`, show the result in the editor, and keep the modal open; every later Save or Run shall update that same case (SPEC-01 AC-54). (verify via: unit test)
- AC-9: WHEN the user clicks Cancel, presses Escape, or closes the seeded editor before any Save or Run, the system shall persist nothing, and the finding card shall stay in its pre-click state. (verify via: unit test; integration test asserting no row after a draft request)
- AC-10: IF Save in a seeded editor returns 409 (a case was created concurrently for the same finding and target), THEN the client shall close the modal and mark the target "In eval set" linking to the returned `case_id`. (verify via: unit test)
- AC-11: WHEN `POST /findings/:id/eval-case` is called without a body (legacy callers, tests), the server shall keep today's behavior: build the draft and persist it unchanged. (verify via: integration test)

### Scoring (reference — fixed before code)
- AC-12: The in-app agent and skill eval scorer shall remain model-free and keep SPEC-02 AC-29 – AC-37: a finding matches when file paths are equal and line ranges overlap (severity/category ignored); `must_find` passes when every expectation is matched; `must_not_flag` passes when no grounded finding overlaps a forbidden location (empty list = whole diff forbidden); suite recall / precision / citation accuracy are pooled over non-errored cases, null on a zero denominator. (verify via: existing unit tests in `reviewer-core/test/eval-score.test.ts`)
- AC-13: The harness skill and agent tiers shall keep SPEC-01-evals AC-5 – AC-9: a `grounding` substring gate scored as a case-insensitive fraction must equal 1 before the judge runs; the LLM judge returns binary PASS/FAIL per practice with a verbatim evidence quote (a non-verbatim PASS counts as FAIL); a case passes when grounding = 1 and judge score ≥ the case `threshold` (default 0.6). (verify via: existing unit tests in `evals/src/scoring/*.test.ts`)
- AC-14: The harness workflow tier shall pass a case only when every declared trace expectation holds (`expectFilesRead`, `expectSubagents`, skill activation / non-activation), with no LLM judge. (verify via: manual check — `pnpm eval:workflow`)

### Agent case set
- AC-15: WHEN the eval seed runs on an empty DB, the system shall seed the Security Reviewer with at least 8 eval cases, where `must_find` and `must_not_flag` each number at least 4 and differ by at most 1. (verify via: unit test over the exported seed case list)
- AC-16: The seeded Security Reviewer case set shall be exactly the following 8 cases (names match the Evals tab in the Dev Digest design artifact), 4 `must_find` and 4 `must_not_flag`; each `must_not_flag` case shall carry an explicit forbidden location unless it asserts an empty diff. (verify via: unit test over the exported seed case list; code review of `server/src/db/seed-eval.ts`)

  | Name | Kind | Expected | Diff shape |
  |---|---|---|---|
  | `stripe-key-leak` *(existing)* | `must_find` | CRITICAL · security · `src/config.ts:12` | live `sk_live_…` key committed in plaintext |
  | `ssrf-webhook` *(existing)* | `must_find` | CRITICAL · security · `src/api/public/webhooks.ts:61-62` | server fetches a user-supplied webhook URL with no allow-list |
  | `lethal-trifecta-callback` | `must_find` | CRITICAL · security | one handler reads private data (customer records), ingests untrusted input (PR/issue text or request body), and sends it to an attacker-controllable outbound callback URL |
  | `service-role-in-client` | `must_find` | CRITICAL · security | Supabase `service_role` key read in a browser bundle (`NEXT_PUBLIC_*` / client component), bypassing row-level security |
  | `clean-refactor-no-flags` *(existing)* | `must_not_flag` | empty — whole diff forbidden | `src/util/format.ts`: arrow → function declaration, behavior unchanged |
  | `retry-after-not-a-secret` *(existing)* | `must_not_flag` | forbidden: `src/middleware/ratelimit.ts:51` | rate limiter adds `res.status(429)` — not a security defect |
  | `no-unused-import-warning` | `must_not_flag` | forbidden: the removed-import line | diff that only removes an unused import — style, not security; the agent must stay silent |
  | `no-raw-body-parser-flag` | `must_not_flag` | forbidden: the `express.raw(...)` route line | Stripe webhook route uses a raw body parser, which signature verification requires — not an injection or parsing risk |

  The design's `missing-retry-after` (bug) and `n-plus-1-users-query` (perf) cases are out of the Security Reviewer's domain and are not seeded for it.
- AC-17: WHEN the seed adds cases, every seeded suite run shall include per-case results for them, so that suite metrics stay internally consistent and the newest run still shows the precision drop that triggers the regression banner. (verify via: integration test — seeded runs' stored metrics equal `aggregateSuiteScores` over their case results; e2e flow 08 still sees "Precision dipped")
- AC-18: The seed shall stay idempotent: re-running it on a DB that already has this agent's cases or suite runs shall add nothing. (verify via: integration test)

### CI gating (`.github/workflows/`)
- AC-19: The repo shall contain three workflows — `evals-skills.yml`, `evals-agents.yml`, `evals-harness.yml` — each triggered on `pull_request` with a `paths` filter and on `workflow_dispatch`. (verify via: `verify:l06`)
- AC-20: `evals-skills.yml` shall trigger on `.claude/skills/**` and `evals/skills/**`; WHEN it runs, it shall always run the model-free static gate `pnpm eval:quality`, then run `pnpm vitest run skills/<name>` for each skill reported by `evals/scripts/ci-detect.mjs`. (verify via: manual check — PR touching a skill)
- AC-21: `evals-agents.yml` shall trigger on `.claude/agents/**` and `evals/agents/**`; WHEN it runs, it shall run `pnpm vitest run agents/<name>` for each agent reported by `ci-detect.mjs`. (verify via: manual check — PR touching an agent)
- AC-22: `evals-harness.yml` shall trigger on `CLAUDE.md`, `**/CLAUDE.md`, `AGENTS.md`, `**/AGENTS.md`, `.claude/settings.json`, `.claude/hooks/**`, `.claude/commands/**`, `.claude/agents/**`, `evals/workflow/**`, and `evals/src/**`; WHEN it runs, it shall run `pnpm typecheck` and the engine unit tests (`vitest run src`), then `pnpm eval:workflow` when `ci-detect.mjs` reports `run_workflow=true`. (verify via: manual check — PR touching `CLAUDE.md`)
- AC-23: WHEN `ci-detect.mjs` classifies changed files, it shall set `run_workflow=true` for any changed `AGENTS.md` or `CLAUDE.md` at any depth, `.claude/settings.json`, `.claude/hooks/**`, and `.claude/commands/**`, in addition to its current rules (each `CLAUDE.md` imports its sibling `AGENTS.md`, so an `AGENTS.md` edit changes the live harness). (verify via: unit test for `ci-detect.mjs`)
- AC-24: Each workflow shall compute the changed-file list from the PR's base…head diff (on `workflow_dispatch`: treat every skill/agent with evals as changed) and pass it to `ci-detect.mjs` via `CHANGED_FILES`. (verify via: manual check)
- AC-25: IF a changed skill or agent has no `*.eval.ts`, THEN the workflow shall print `SKIP <name> (no evals)` and not fail on its account. (verify via: manual check)
- AC-26: IF no model credential secret is configured (`CLAUDE_CODE_OAUTH_TOKEN` for the default subscription backend, or `OPENROUTER_API_KEY` with `EVAL_BACKEND=openrouter` for the skill/agent tiers), THEN each LLM-tier step shall be skipped with a visible notice naming the missing secret, while the model-free steps (static gate, typecheck, unit tests) still run and gate the job. (verify via: manual check — fork PR without secrets)
- AC-27: WHEN any eval case fails in a workflow, the job shall fail (vitest exit code) and upload `evals/results/` as a build artifact. (verify via: manual check)

### `verify:l06`
- AC-28: `evals/package.json` shall define `verify:l06`, runnable with `pnpm verify:l06` from `evals/`, with no model call, no network beyond the installed deps, and no Docker. (verify via: run it)
- AC-29: WHEN `verify:l06` runs, it shall check and print one PASS/FAIL line each for: this spec file exists; the three workflow files exist and each invokes `ci-detect.mjs`; the seeded agent case list satisfies AC-15 (counted statically from `server/src/db/seed-eval.ts`); `pnpm typecheck` passes; `vitest run src` (engine unit tests, including `ci-detect`) passes; `pnpm eval:quality` passes. (verify via: run it; break one item and see it fail)
- AC-30: IF any check fails, THEN `verify:l06` shall still run the remaining checks, print a summary, and exit non-zero; WHEN all pass, it shall exit zero. (verify via: run it)

## Edge cases
- Finding decided, then un-decided (status reset) while the preview is open → Save returns 400 `finding_undecided`; the modal stays open with the error, edits intact.
- Agent deleted while the preview is open → Save returns 400 `no_agent`; same handling.
- Skill unlinked from the agent while its preview is open → Save returns 400 bad target; same handling.
- Finding whose file is no longer in the PR diff (force-push) → draft builds from the stored diff as today; if the frozen hunk is empty, the editor shows the empty diff and the SPEC-01 AC-48 "not present in the diff" warning on the entry; saving is still allowed.
- Full-file finding (no line range) → draft freezes all of that file's hunks, as today.
- User edits the diff so the expected entry no longer overlaps it → AC-48 warning, Save allowed.
- Draft request double-clicked → the button is disabled while the draft loads; one modal at most.
- Two tabs save the same (finding, target) → the second gets 409 → AC-10.
- Seed re-run on a DB seeded with the old 4 cases → idempotent skip (AC-18); the larger set only appears on a fresh DB (`pnpm db:seed` after reset). Documented in the server README.
- PR from a fork (no secrets) → LLM tiers skipped (AC-26), static gates still required.
- PR touching only `evals/README.md` → no workflow triggers (not in any `paths` filter).
- `ci-detect.mjs` given a deleted `.claude/agents/<name>.md` → the agent is reported; its eval run fails because the artifact is gone — intended (a deleted agent with evals must also delete its evals).

## Non-functional requirements
- Draft endpoint: one DB read + one diff load, no LLM call; same latency class as today's create.
- The seeded editor never sends a write request before an explicit Save / Run.
- CI cost: LLM-tier jobs run only for the artifacts that changed (no full-suite run on every PR); the workflow tier's budget stays at the 5 sessions documented in `evals/workflow/review-workflow.cases.ts`.
- CI workflows pin action versions and set `concurrency` per PR to cancel superseded runs.
- `verify:l06` finishes in under 2 minutes on a dev laptop with deps installed.
- All new UI strings go through `next-intl` (`messages/en/prReview.json`, `eval.json`).

## Inputs and provenance
- Draft: finding, review, PR, repo rows (DB) + PR diff (GitHub adapter / cache), as in today's `createFromFinding`.
- Save overrides: user-typed text in the editor (name, diff, PR meta, expected output).
- CI: changed-file list from `git diff` on the runner; secrets from GitHub Actions secrets.
- Seed: fixed literals in `server/src/db/seed-eval.ts`.

## Untrusted inputs
- Override fields in `POST /findings/:id/eval-case` are user input: validated by the same zod contract as `POST /eval-cases` (lengths, array shape, positive integer lines with start ≤ end); `input_diff` is stored and later sent to the model as data, never executed.
- Diff and PR meta originate from GitHub (PR author-controlled) — rendered as text in DiffView, never as HTML.
- CI must not run LLM-tier evals with secrets on `pull_request_target` or expose secrets to fork code; workflows use `pull_request` only.

## Module interactions / API contracts
- New: `GET /findings/:id/eval-case-draft?target_kind=agent|skill&target_id=<uuid>` → `200 EvalCaseDraft` | `404` | `400 { code }` | `409 { case_id }`.
- Changed: `POST /findings/:id/eval-case` body `{ target?, overrides?: { name?, input_diff?, input_meta?, expected_output? } }` (all optional; absent → AC-11).
- Shared contracts: `EvalCaseDraft` and the extended `CreateEvalCaseFromFindingBody` live in the shared package (`eval-suite.ts`), re-vendored into `server/src/vendor/shared` and `client/src/vendor/shared`.
- Server: `EvalService.buildDraftFromFinding()` extracted from `createFromFinding()`; both routes use it.
- Client: `EvalCaseAction` fetches the draft and opens `EvalCaseEditorModal` with a new `seed` prop (draft + finding id + target); the modal's first persist goes through `createEvalCaseFromFinding(findingId, target, overrides)` instead of `POST /eval-cases`.
- Evals: `scripts/ci-detect.mjs` (AC-23), new `scripts/verify-l06.mjs`, three workflows under `.github/workflows/`.
- e2e: `e2e/specs/08-evals.flow.json` gains the preview step (modal opens → Save) before the "must find case" confirmation.

## Open questions
- None blocking. Defaults chosen: `verify:l06` lives in `evals/package.json` (no root `package.json` per root `AGENTS.md`); the case-set growth applies to the seeded in-app Security Reviewer (the `architecture-reviewer` harness eval keeps its 4 cases). Revisit either if the course rubric expects otherwise.
