# Spec: Evals — regression harness for reviewer agents (server)
Spec ID: SPEC-02
Status: draft
Supersedes: none

Client side: [`../../client/specs/agent-evals.md`](../../client/specs/agent-evals.md) (SPEC-01).
Design references: `docs/design/evals/01..06-*.png`, `docs/design/evals/proto-evals-tab.png`.

## Changelog
- 2026-10-09 — Amended by [`../../evals/specs/eval-pipeline.md`](../../evals/specs/eval-pipeline.md) (SPEC-09): new read-only `GET /findings/:id/eval-case-draft` (same validation/409 as create, writes nothing); `POST /findings/:id/eval-case` accepts optional user `overrides` (name, diff, meta, expected output) validated like a manual create, and keeps its no-body behavior; the seeded Security Reviewer case set grows to ≥ 8 balanced `must_find` / `must_not_flag` cases with per-case results in every seeded suite run.
- 2026-10-07 — Added AC-52: case create/update rejects a non-array `expected_output` (including `null` and objects) with 422 (user decision R1, bug B2 in `docs/plans/2026-10-07-unfinished-features-and-critical-bugs.md`). Previously the field was accepted as anything, and for `must_not_flag` a stored `null` scored as an empty forbidden list, i.e. AC-32's "whole diff forbidden". The malformed-`expected_output` edge case was narrowed accordingly. Client counterpart: SPEC-01 AC-52 – AC-54.
- 2026-10-06 — AC-7 and AC-12 amended: "Turn into eval case" can now target a skill linked to the finding's agent ([`skill-evals.md`](./skill-evals.md), SPEC-08), so the duplicate check and the finding's case link are per (finding, target). Skill-owned runs move to versioned background suite runs under SPEC-08, replacing the synchronous skill batch noted as "kept" below.
- 2026-10-06 — Resolved all open questions: Learn split out to a future spec (decisions recorded in Non-goals); Reply persists the comment URL/time and refuses a second reply (409); Promote refuses with 409 when a snapshot skill was deleted and links current skill text otherwise; suite runs left `running` by a restart are marked `failed` ("interrupted") on boot. ACs renumbered.
- 2026-10-06 — Evolved into a versioned regression harness: cases seeded from accepted/dismissed findings (`must_find` / `must_not_flag`, `manual`), a new suite-run entity (one row per agent run, tied to an `agent_versions` snapshot) with background execution, pooled scoring on file + line overlap only (severity no longer matched), per-agent and cross-agent dashboards, run compare, Promote vN, skill link changes bumping the agent version, plus the FindingCard Reply-to-author action (Learn was in this entry's scope, later split out — see the newer entry above). Status moved back to `draft`. Already built before this change and kept: case CRUD, single-case run (`POST /eval-cases/:id/run`), per-case `eval_runs` rows, `scoreEvalCase`, citation accuracy from the grounding gate, `agent_versions` snapshots on agent config edits, skill-owned case runs.
- 2026-10-06 — Prior content (pre-changelog): single-case vs. workspace batch run, greedy file + severity + line-overlap scoring, `pass = recall === 1 && precision === 1`, agent-only runnability (later extended to skill-owned cases).

## Problem and user
A developer tuning a reviewer agent (system prompt, model, linked skills) has
no numeric signal for whether a change made the agent better or worse. Their
accept/dismiss decisions on real findings already encode ground truth, but
nothing turns those decisions into a frozen regression set, runs an agent
version against it, and lets them compare two versions side by side.

## Goals / Non-goals
Goals
- Turn an accepted finding into a `must_find` case and a dismissed finding into a `must_not_flag` case in one action, with frozen inputs.
- Run an agent's whole case set as one versioned, background "suite run" and score it mechanically (no model in the scorer).
- Show per-agent and cross-agent run history, metric deltas, a regression banner, and a two-run compare including the config diff.
- Promote an older agent version back to current.
- Reply to author: publish a finding as an inline GitHub PR comment after confirmation.

Non-goals
- No model call anywhere in scoring or in the regression banner text.
- No "Files" input on a case (`input_files` stays accepted but unused) — `reviewPullRequest` has no slot for it.
- No cost limit / budget guard on runs.
- Eval runs never appear in Stats / Agent Performance.
- Single-case runs ("Run case", "Run on save") are not versioned suite runs and never appear in run history or compare.
- No parallel execution of cases within a suite run (sequential, as today).
- FindingCard **Learn** (finding → project Memory lesson) is split out to a separate future spec; nothing here implements the `learn` action. Decisions already made for that spec: inject all `learning` Memory entries for the PR's repo, newest first, at most 20, no embedding retrieval; never inject Memory into eval runs (eval inputs stay frozen).
- Promote does not roll back a skill's text — only skill links are restored.

## User stories
- As an agent author, I change the system prompt, run evals, and compare the new run against the previous one to see whether recall/precision/citation moved.

## Acceptance criteria (EARS)

### Case creation from a finding
- AC-1: WHEN a client requests an eval case from an accepted finding, the system shall create an agent-owned case with kind `must_find`, source `finding_accepted`, and one expected entry carrying the finding's file, start/end line, severity, category, and title. (verify via: integration test)
- AC-2: WHEN a client requests an eval case from a dismissed finding, the system shall create an agent-owned case with kind `must_not_flag`, source `finding_dismissed`, and one forbidden location carrying the finding's file and start/end line. (verify via: integration test)
- AC-3: WHEN a case is created from a finding, the system shall freeze into the case the unified-diff hunks of that finding's file that contain the finding's line range, plus the PR title and body. (verify via: integration test)
- AC-4: WHEN a case is created from a finding, the system shall set the owner to the agent whose review produced the finding. (verify via: integration test)
- AC-5: IF the finding's review has no agent, THEN the system shall reject the request with a 400 error and create no case. (verify via: integration test)
- AC-6: IF the finding is neither accepted nor dismissed, THEN the system shall reject the request with a 400 error and create no case. (verify via: integration test)
- AC-7: IF a case already exists for the same source finding and the same target (agent, or a skill per SPEC-08), THEN the system shall respond 409 with the existing case's id and create no new case. (verify via: integration test)
- AC-8: WHEN a case is created from a finding, the system shall default its name to the kebab-case form of the finding title. (verify via: unit test)
- AC-9: WHEN a finding has no line range (full-file kinds such as `secret_leak`/`hook`), the system shall treat its location as the whole file and freeze all of that file's hunks. (verify via: unit test)
- AC-10: WHEN the source finding, its review, or its PR is deleted, the system shall keep the case and its frozen inputs and clear only its link to the finding. (verify via: integration test)
- AC-11: WHEN a case is created through the generic create endpoint (not from a finding), the system shall record source `manual` and accept a kind of `must_find` or `must_not_flag`. (verify via: integration test)
- AC-52: IF a case create or update request carries an `expected_output` that is not an array (including `null` or an object), THEN the system shall reject it with 422 and persist nothing. (verify via: integration test)
- AC-12: WHEN listing a finding's data for the PR review screen, the system shall include every eval case created from it with its target kind, target id, and case id (empty when none). (verify via: integration test)

### Agent versioning
- AC-13: WHEN an agent's linked skills are linked, unlinked, or reordered, the system shall bump the agent's version and store a new `agent_versions` snapshot. (verify via: integration test)
- AC-14: WHEN an `agent_versions` snapshot is stored, the system shall record each linked skill's id together with that skill's own version at snapshot time. (verify via: unit test)
- AC-15: WHEN a client promotes version N of an agent, the system shall apply snapshot N's provider, model, system prompt, strategy, and skill links (in snapshot order) as the agent's current config and store it as a new version (current max + 1). (verify via: integration test)
- AC-16: IF any skill referenced by snapshot N no longer exists, THEN the system shall reject the promote with 409 listing the missing skills and change nothing; skills that do exist are linked with their current text, not the snapshot-time text. (verify via: integration test)

### Suite runs (`POST /agents/:id/eval-runs`)
- AC-17: WHEN a client starts an agent eval run, the system shall create a suite run with status `running` referencing the agent's current version snapshot and respond 202 with its id and total case count without waiting for cases to finish. (verify via: integration test)
- AC-18: WHILE a suite run is `running`, the system shall execute the agent's cases sequentially in the background, persisting one per-case result linked to the suite run as each case finishes. (verify via: integration test)
- AC-19: WHILE a suite run is `running`, the system shall report its progress as completed-case count and total case count on the suite-run read endpoint. (verify via: integration test)
- AC-20: IF a suite run for the same agent is already `running`, THEN the system shall respond 409 and start no new run. (verify via: integration test)
- AC-21: IF the agent has no eval cases, THEN the system shall respond 400 and create no suite run. (verify via: integration test)
- AC-22: IF a single case fails to execute (e.g. model error), THEN the system shall mark that case's result `errored` with the error message, exclude it from the run's metrics and pass count, and continue with the remaining cases. (verify via: integration test)
- AC-23: WHEN every case of a suite run has been processed, the system shall set status `completed` if at least one case finished without error, otherwise `failed`. (verify via: integration test)
- AC-24: WHEN a suite run finishes, the system shall store on it pooled recall, precision, citation accuracy, passed count, non-errored case count, errored count, total duration, and summed cost (null if any finished case's cost is unknown). (verify via: integration test)
- AC-25: WHEN a suite run executes a case, the system shall record a fingerprint of that case's inputs (diff, PR meta, expected output/forbidden locations) on the per-case result so later runs can detect edited cases. (verify via: unit test)
- AC-26: WHEN a single case is run outside a suite ("Run case", "Run on save"), the system shall persist its per-case result with no suite-run link. (verify via: integration test)
- AC-27: WHEN a client starts "Run all agents", the system shall start suite runs for every enabled agent that has at least one case, one agent after another, skipping agents with a run already `running`, and respond 202 with the started agents. This replaces the previous workspace-wide "Run eval (N)" batch. (verify via: integration test)
- AC-28: WHEN the server starts, the system shall mark every suite run still `running` as `failed` with reason "interrupted", releasing the per-agent run lock. (verify via: integration test)

### Scoring (pure, no model call)
- AC-29: WHEN scoring, the system shall count an actual finding as matching an expected entry or forbidden location IF AND ONLY IF the file paths are equal and the line ranges overlap; severity and category shall not affect matching. (verify via: unit test)
- AC-30: WHEN scoring a `must_find` case, the system shall match expected entries to grounded findings one-to-one and treat every unmatched grounded finding as noise. (verify via: unit test)
- AC-31: WHEN scoring a `must_not_flag` case, the system shall treat every grounded finding overlapping a forbidden location as noise and every other grounded finding as non-noise. (verify via: unit test)
- AC-32: WHERE a `must_not_flag` case has an empty forbidden-location list, the system shall treat the whole diff as forbidden ("assert empty"). (verify via: unit test)
- AC-33: WHEN aggregating a suite run, the system shall compute recall as matched `must_find` expectations divided by all `must_find` expectations across non-errored cases. (verify via: unit test)
- AC-34: WHEN aggregating a suite run, the system shall compute precision as non-noise grounded findings divided by all grounded findings across non-errored cases. (verify via: unit test)
- AC-35: WHEN aggregating a suite run, the system shall compute citation accuracy as grounding-gate kept findings divided by kept plus dropped findings across non-errored cases. (verify via: unit test)
- AC-36: IF a metric's denominator is zero, THEN the system shall store that metric as null. (verify via: unit test)
- AC-37: WHEN scoring a single case, the system shall mark a `must_find` case passed only if all its expectations are matched (extra noise does not fail it) and a `must_not_flag` case passed only if no grounded finding overlaps its forbidden locations. (verify via: unit test)

### History, dashboards, compare
- AC-38: WHEN a client lists an agent's suite runs with a range of 7, 30, or 90 days or all, the system shall return only runs started within that range, newest first, each with version, metrics, pass x/y, errored count, cost, and status. (verify via: integration test)
- AC-39: WHEN the latest finished suite run of an agent has any metric at least 1 percentage point lower than the agent's previous finished suite run, the system shall return a regression alert naming the dropped metric(s), the point drop, the version, and the direction of the other metrics, built from a fixed template. (verify via: unit test)
- AC-40: WHEN a client requests the cross-agent dashboard, the system shall return for each agent its latest finished suite run (version, date, pass x/y, metrics), a short per-agent metric history for a sparkline, and the most recent suite runs across all agents. (verify via: integration test)
- AC-41: WHEN a client compares two suite runs of the same agent, the system shall return both runs' metrics and costs, their deltas (new minus old), both versions' system prompts, model, and skill lists (with skill versions). (verify via: integration test)
- AC-42: WHEN the two compared runs executed different sets of case ids, the system shall report both case counts as a "case sets differ" flag. (verify via: unit test)
- AC-43: WHEN a case executed in both compared runs has a different input fingerprint between them, the system shall report the number of edited cases. (verify via: unit test)
- AC-44: IF the two runs belong to different agents, THEN the system shall reject the compare request with 400. (verify via: integration test)
- AC-45: WHEN an agent's per-case eval stats are requested for the Evals tab, the system shall return the latest finished suite run's metrics and pass x/y with deltas vs. the previous finished suite run, plus each case's latest result from any run. (verify via: integration test)
- AC-46: WHEN suite runs or single-case runs execute, the system shall not create agent runs or reviews counted by Stats / Agent Performance. (verify via: integration test)

### Finding action: Reply to author
- AC-47: WHEN a client sends the `reply` action for a finding with a body, the system shall post that body as an inline review comment on the finding's PR at the head commit, file, and end line, and return the created comment. (verify via: integration test)
- AC-48: WHEN a reply is posted successfully, the system shall store the GitHub comment URL and the posting time on the finding and include both in the finding's data. (verify via: integration test)
- AC-49: IF the finding already has a posted reply, THEN the system shall respond 409 and post nothing. (verify via: integration test)
- AC-50: IF GitHub is not connected or rejects the comment (e.g. line outside the diff, closed PR), THEN the system shall return a 400 error with GitHub's reason and record nothing as posted. (verify via: integration test)

### Experiment
- AC-51: WHEN an agent's system prompt is deliberately degraded and a new suite run executes on the same case set, the later run's precision shall be lower than the earlier run's. (verify via: manual check)

## Edge cases
- Server restart while a suite run is `running`: marked `failed` ("interrupted") on boot (AC-28); its finished per-case results stay readable.
- Case edited (diff/expected) after a run: allowed; detected in compare via fingerprints (AC-43), never silently merged.
- Case deleted between two compared runs: shows up as "case sets differ" (AC-42).
- Snapshot written before this change has `skills` as plain ids without versions: compare renders them without a version.
- Malformed `expected_output` on a manual case keeps the current behavior (degrades to empty list) — for `must_find` that means recall null for that case's contribution. *(2026-10-07)* This now applies only to an array whose entries are malformed, or to rows stored before AC-52; a non-array value is rejected at write time (AC-52).
- Agent deleted: its cases and suite runs cascade away with it.
- Per-case cost unknown → suite cost null, shown as "—".

## Non-functional requirements
- Determinism: scoring and the regression alert are pure functions of stored data; the same inputs yield the same numbers.
- Comparability: a suite run's per-case inputs come only from the case's frozen fields; nothing is re-fetched from git or GitHub at run time.
- Responsiveness: starting a suite run responds without waiting on any model call (AC-17).
- Contract parity: every new or changed shared contract (suite run, compare, case kind/source, `AgentVersionConfig` with skill versions, `AgentVersion`) shall be applied identically to `server/src/vendor/shared` and `client/src/vendor/shared`. The client copy currently lacks `AgentVersionConfig`/`AgentVersion` (see `server/INSIGHTS.md` 2026-09-30) and must gain them. Diff only the touched files to confirm parity, not the whole tree.
- Migrations are additive and run by hand (`pnpm db:migrate`); existing `eval_runs` rows remain readable as single-case results with no suite link.

## Inputs and provenance
- [reused: finding row] file, lines, severity, category, title, rationale, accept/dismiss state — from the existing review.
- [deterministic: diff loader + hunk filter] frozen diff fragment — the finding file's hunks overlapping the finding range.
- [reused: pull_requests] PR title/body frozen into the case.
- [reused: agent_versions] config used by a suite run and shown in compare.
- [new: 1 review per case per suite run] `reviewPullRequest` with the agent's current config (internal call count follows the agent's strategy).
- [deterministic: scorer] matches, noise, pass, pooled metrics, deltas, regression alert text, input fingerprints.
- [reused: user-edited text] Reply comment body.

## Untrusted inputs
- Frozen diffs, PR title/body, and finding text are untrusted: they reach the model only as review data via the existing prompt slots, never as instructions.
- `expected_output` / forbidden locations are validated with Zod before scoring, and *(2026-10-07)* must be an array at write time (AC-52).
- Reply bodies are user-edited and posted verbatim to GitHub; the server performs no templating on them.

## Module interactions / API contracts
- `POST /findings/:id/eval-case` → 201 `EvalCase` | 400 (undecided / agentless) | 409 `{ case_id }` (per finding + target; optional `target` body per SPEC-08).
- `POST /agents/:id/eval-runs` → 202 `{ run_id, status: 'running', cases_total }` | 400 (no cases) | 409 (already running).
- `GET /agents/:id/eval-runs?range=7d|30d|90d|all` → suite runs + alert.
- `GET /eval-suite-runs/:id` → status, progress, per-case results (incl. `errored`).
- `GET /agents/:id/eval-runs/compare?base=<runId>&head=<runId>` → metrics, deltas, configs, case-set flags.
- `POST /agents/:id/versions/:version/promote` → updated agent with new version.
- `POST /eval-dashboard/run-all` → 202 `{ started: agentId[], skipped: agentId[] }` (replaces previous batch semantics).
- `GET /eval-dashboard` → per-agent latest-run summaries + recent suite runs across agents.
- `POST /findings/:id/reply` (body `{ reply }`) → created comment | 400 | 409 — existing `FindingActionKind` value `reply`, now implemented (`learn` stays unimplemented, see Non-goals). Reply reuses the GitHub adapter's `createReviewComment` path already used by `POST /pulls/:id/comments`.
- `reviewer-core`: `scoreEvalCase` changes to file + line-overlap matching with `must_find` / `must_not_flag` semantics; still pure, no I/O.
- reviews module: finding data gains the linked eval cases (per target) and the posted reply URL/time.

## Open questions
None — all resolved 2026-10-06.
