# Spec: Skill evals — regression harness for skills (server)
Spec ID: SPEC-08
Status: draft (server implemented 2026-10-07; AC-38 manual experiment pending; client SPEC-08 not built)
Supersedes: none

Client side: [`../../client/specs/skill-evals.md`](../../client/specs/skill-evals.md) (SPEC-08).
Builds on: [`eval.md`](./eval.md) (SPEC-02, agent eval harness — case model, frozen inputs, scorer, suite-run semantics) and [`skills.md`](./skills.md) (SPEC-01, skill versioning, trust by source).
Design reference: `docs/design/evals/skill-editor-evals-tab.png`.

## Changelog
- 2026-10-06 — initial version

## Problem and user
A skill author edits a skill's text and needs to know whether the skill still
catches what it should and still stays quiet where it should. Today skill-owned
eval cases exist, but "Run all evals" is one synchronous HTTP request with
averaged per-case metrics: no background progress, no history, no link to the
skill version, no deltas, no compare. Cases can only be typed in by hand, never
seeded from a real finding. Deleting a skill orphans its cases, and skill evals
send a skill's text to the model even when its security scan has not passed.

## Goals / Non-goals
Goals
- Versioned, background suite runs for a skill, tied to the skill's version, scored with the same mechanical scorer and pooled metrics as agent suite runs.
- Draft runs: evaluate unsaved skill text against the skill's cases without creating a version.
- Per-skill run history, regression alert, two-run compare, and Promote (via the existing Restore).
- Cross-skill dashboard data and "Run all skills".
- "Turn into eval case" can target a skill linked to the finding's agent.
- Fix: cascade-delete a skill's eval data; refuse runs while the skill's scan has not passed.

Non-goals
- No model call in scoring or in the regression alert text (same as SPEC-02).
- No host agent: a skill is always evaluated in isolation (baseline prompt + only this skill + the workspace `skill_eval` model).
- No Project Context or Memory injection into skill eval runs — inputs stay frozen.
- Draft runs never appear in history, the regression alert, compare, dashboards, deltas, or case "latest result".
- Skill eval runs never appear in Stats / Agent Performance.
- No parallel case execution within a run.
- No new rollback mechanism — Promote reuses the existing skill version Restore.

## User stories
None beyond the goals.

## Acceptance criteria (EARS)

### Suite runs (`POST /skills/:id/eval-runs`, no `draft_body`)
- AC-1: WHEN a client starts a skill eval run without `draft_body`, the system shall create a suite run with status `running` referencing the skill's current version and the resolved `skill_eval` provider and model, and respond 202 with `{ run_id, cases_total, is_draft: false }` without waiting for cases to finish. (verify via: integration test)
- AC-2: WHILE a skill suite run is `running`, the system shall execute the skill's cases sequentially in the background using the baseline skill-eval system prompt, only that skill's text as captured at run start, and the resolved `skill_eval` model, persisting one per-case result linked to the run as each case finishes. (verify via: integration test)
- AC-3: WHEN the skill's text is saved as a new version while its run is `running`, the system shall finish the run with the text and version captured at run start. (verify via: integration test)
- AC-4: WHILE a skill run is `running`, the system shall report completed-case count and total case count on the suite-run read endpoint. (verify via: integration test)
- AC-5: IF any run (suite or draft) of the same skill is already `running`, THEN the system shall respond 409 and start no new run. (verify via: integration test)
- AC-6: IF the skill has no eval cases, THEN the system shall respond 400 and create no run. (verify via: integration test)
- AC-7: IF the skill's scan status is blocking, `pending`, or `error`, THEN the system shall respond 422 with an error naming the scan state, create no run, and send no skill text to any model. (verify via: integration test)
- AC-8: WHERE the skill is disabled and its scan has passed, the system shall allow the run. (verify via: integration test)
- AC-9: IF a single case fails to execute, THEN the system shall mark that case's result `errored` with the error message, exclude it from metrics and pass count, and continue with the remaining cases. (verify via: integration test)
- AC-10: WHEN every case of a skill run has been processed, the system shall set status `completed` if at least one case finished without error, otherwise `failed`. (verify via: integration test)
- AC-11: WHEN a skill run finishes, the system shall store on it pooled recall, precision, citation accuracy, passed count, non-errored case count, errored count, duration, and summed cost (null if any finished case's cost is unknown), using the same pooling rules as SPEC-02 AC-33..AC-36. (verify via: unit test)
- AC-12: WHEN a skill run executes a case, the system shall record that case's input fingerprint on the per-case result. (verify via: unit test)
- AC-13: WHEN the server starts, the system shall mark every skill run (suite or draft) still `running` as `failed` with reason "interrupted". (verify via: integration test)

### Draft runs (`POST /skills/:id/eval-runs` with `draft_body`)
- AC-14: WHEN a client starts a skill eval run with a `draft_body` that differs from the skill's saved text, the system shall create a draft run (`is_draft: true`, no version) that executes the cases with the draft text under the same rules as AC-2, AC-4..AC-7, AC-9..AC-12, and respond 202. (verify via: integration test)
- AC-15: IF `draft_body` equals the skill's saved text, THEN the system shall start a normal versioned suite run as in AC-1 and respond with `is_draft: false`. (verify via: integration test)
- AC-16: WHEN a new draft run of a skill is created, the system shall delete that skill's previous draft run and its per-case results, keeping at most one draft run per skill. (verify via: integration test)
- AC-17: WHEN computing run history, the regression alert, compare, dashboards, metric deltas, or a case's latest result, the system shall exclude draft runs and their per-case results. (verify via: integration test)
- AC-18: WHEN a client lists a skill's runs, the system shall return the skill's latest draft run (status, progress, metrics, per-case results) separately from the versioned runs, or null if none exists. (verify via: integration test)
- AC-19: WHEN a draft run starts, executes, or finishes, the system shall leave the skill's saved text and version unchanged. (verify via: integration test)

### Stats, history, compare
- AC-20: WHEN a skill's eval stats are requested, the system shall return the latest finished suite run's metrics and pass x/y with deltas vs. the previous finished suite run, plus each case's latest non-draft result. (verify via: integration test)
- AC-21: WHEN a client lists a skill's suite runs with a range of 7, 30, or 90 days or all, the system shall return only non-draft runs started in that range, newest first, each with skill version, provider, model, metrics, pass x/y, errored count, cost, and status. (verify via: integration test)
- AC-22: WHEN the latest finished skill suite run has any metric at least 1 percentage point lower than the previous finished one, the system shall return a regression alert built from the same fixed template as agent runs. (verify via: unit test)
- AC-23: WHEN the two runs behind a regression alert used a different provider or model, the system shall add "model changed between runs" to the alert. (verify via: unit test)
- AC-24: WHEN a client compares two suite runs of the same skill, the system shall return both runs' metrics and costs, their deltas (new minus old), both versions' skill text, provider and model before → after, a "model changed" flag, and the case-set-differ and edited-case flags as in SPEC-02 AC-42/AC-43. (verify via: integration test)
- AC-25: WHEN ordering the two compared runs, the system shall treat the lower skill version as old, falling back to start time when versions are equal. (verify via: unit test)
- AC-26: IF the two compared runs belong to different skills, or either is a draft run, THEN the system shall reject the compare with 400. (verify via: integration test)

### Cross-skill dashboard
- AC-27: WHEN a client requests the cross-skill dashboard, the system shall return every skill in the workspace (including skills with no cases) with its case count, latest finished suite run, metric history of its last 10 finished suite runs, and running-run progress if any, plus the most recent suite runs across all skills. (verify via: integration test)
- AC-28: WHEN a client starts "Run all skills", the system shall start suite runs for every skill that has at least one case, skipping skills whose scan status is blocking, `pending`, or `error` and skills with a run already `running`, execute them one skill after another, and respond 202 with started and skipped skill ids. (verify via: integration test)

### Case from a finding with a skill target
- AC-29: WHEN a client requests an eval case from a decided finding with target `{ kind: 'skill', id }`, the system shall create a skill-owned case with the same kind, source, expected entry/forbidden location, frozen diff, PR meta, and default name rules as SPEC-02 AC-1..AC-3, AC-8, AC-9. (verify via: integration test)
- AC-30: IF the target skill is not currently linked to the agent whose review produced the finding, THEN the system shall reject the request with 400 and create no case. (verify via: integration test)
- AC-31: IF a case already exists for the same finding and the same target, THEN the system shall respond 409 with the existing case's id; a case for the same finding with a different target shall be allowed. (verify via: integration test)
- AC-32: WHEN the request has no target, the system shall target the finding's agent, as in SPEC-02. (verify via: integration test)
- AC-33: WHERE the target skill's scan has not passed, the system shall still create the case. (verify via: integration test)
- AC-34: WHEN listing a finding's data for the PR review screen, the system shall include every eval case created from it with its target kind, target id, and case id. (verify via: integration test)

### Skill deletion
- AC-35: WHEN a skill is deleted, the system shall delete its eval cases, their per-case results, and all its suite and draft runs. (verify via: integration test)
- AC-36: IF a skill is deleted while one of its runs is `running`, THEN the background execution shall stop before the next case and write nothing further. (verify via: integration test)

### Removed route
- AC-37: WHEN a client calls `POST /skills/:id/eval-cases/run-all`, the system shall respond 404 (route removed, replaced by AC-1). (verify via: integration test)

### Experiment
- AC-38: WHEN a skill's text is deliberately degraded and a new suite run executes on the same case set, the later run shall show a lower recall or precision than the earlier run. (verify via: manual check)

## Edge cases
- A skill unlinked from an agent after a case was seeded from that agent's finding: the case stays with the skill.
- Skill eval results written before this change (no suite-run link) stay readable as single-case results and never enter history or compare.
- Case edited between runs → "N cases edited" in compare; case added/deleted → "case sets differ".
- Single-case runs ("Run case", "Run on save") on a skill-owned case follow AC-7 (refused while the scan has not passed) and have no suite-run link.
- A skill whose `skill_eval` model setting changed between runs: compare and the alert say so (AC-23, AC-24) instead of blaming the text.
- Per-case cost unknown → run cost null.

## Non-functional requirements
- Determinism: scoring, pooling, deltas, and the alert are pure functions of stored data.
- Comparability: run inputs come only from each case's frozen fields and the skill text captured at run start.
- Responsiveness: starting any run responds without waiting on a model call.
- Contract parity: new/changed shared contracts (skill suite run, draft run, skill compare, skill dashboard, finding eval-case target, per-target case list on findings) are applied identically to `server/src/vendor/shared` and `client/src/vendor/shared`; diff only the touched files.
- Migrations are additive and run by hand (`pnpm db:migrate`).

## Inputs and provenance
- [reused: eval_cases] frozen diff, PR meta, expected output / forbidden locations.
- [reused: skills / skill_versions] skill text at run start; both versions' text for compare.
- [reused: user-edited text] `draft_body` from the Skill Editor.
- [reused: settings] resolved `skill_eval` provider + model, recorded per run.
- [reused: finding row] location, severity, category, title, decision — for skill-targeted case seeding.
- [new: 1 review per case per run] `reviewPullRequest` with the baseline skill-eval prompt and only this skill.
- [deterministic: scorer] matches, noise, pass, pooled metrics, deltas, alert text, fingerprints, "model changed" flag.

## Untrusted inputs
- Frozen diffs, PR title/body, and finding text reach the model only as review data via the existing prompt slots, never as instructions.
- `draft_body` is untrusted text that has not been scanned. Draft runs are allowed only when the saved skill's scan has passed (AC-7), and the draft text is never persisted as a version or shown outside its own run.
- A skill's text never reaches a model while its scan status is blocking, `pending`, or `error`.
- `expected_output` / forbidden locations are validated with Zod before scoring.

## Module interactions / API contracts
- `POST /skills/:id/eval-runs` (body `{ draft_body?: string }`) → 202 `{ run_id, status: 'running', cases_total, is_draft }` | 400 (no cases) | 409 (a run is in progress) | 422 (scan not passed).
- `GET /skills/:id/eval-runs?range=7d|30d|90d|all` → `{ runs, history, alert, cases_total, latest_draft }`.
- `GET /eval-suite-runs/:id` → status, progress, per-case results; serves skill suite and draft runs too.
- `GET /skills/:id/eval-runs/compare?base=<runId>&head=<runId>` → metrics, deltas, skill text old/new, provider/model old/new, `model_changed`, case-set flags.
- `GET /skills/:id/eval-stats` → as today, now backed by the latest finished suite run (AC-20).
- `GET /eval-dashboard/skills`, `POST /eval-dashboard/skills/run-all` → 202 `{ started: skillId[], skipped: skillId[] }`.
- `POST /findings/:id/eval-case` (body `{ target?: { kind: 'agent' | 'skill', id: string } }`) → 201 `EvalCase` | 400 | 409 `{ case_id }` per (finding, target). Amends SPEC-02 AC-7 / AC-12.
- Promote uses the existing `POST /skills/:id/versions/:version/restore` unchanged.
- Removed: `POST /skills/:id/eval-cases/run-all`.
- skills module: skill delete triggers the eval data cascade (AC-35); the scan gate reuses the existing scan-blocking rule plus `pending` / `error`.
- `reviewer-core`: `scoreEvalCase` / suite pooling reused unchanged.

## Open questions
None.
