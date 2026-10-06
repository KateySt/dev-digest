# Agent Editor — Evals tab, Eval Case Editor, Eval Dashboard

Spec ID: SPEC-01
Status: implemented
Supersedes: none

**Status: implemented.** Built against the already-existing `eval_cases`/
`eval_runs` schema and `EvalCase`/`EvalRun`/`EvalPerTrace` contracts, plus one
additive contract (`EvalCaseRun`, `EvalCaseListItem`) added to resolve the
open question below.

## Resolved: `EvalRun` vs. a single case's result

`EvalRun` (`per_trace[]`, `traces_passed`/`traces_total`) is the response of
the **global Eval Dashboard's** "Run eval (N)" — a workspace-wide batch that
runs every eval case sequentially and aggregates the results. It is NOT a
per-case row. A single case's "Run" (Evals tab) or "Run case" (editor modal)
persists one `eval_runs` row and returns the new `EvalCaseRun` type instead.
The Evals tab's case list embeds each case's latest one as
`EvalCaseListItem.last_run`. No new DB table was needed — "Run eval (N)" just
calls the single-case path once per case, in a loop; there's no batch/session
concept in the schema, so the dashboard's trend/recent-runs reads the flat
`eval_runs` history directly (no grouping).

## What was built

- `reviewer-core/src/output/eval-score.ts` — `scoreEvalCase`, pure greedy
  one-to-one matching (file + severity + line-range overlap) between an eval
  case's hand-authored `expected_output` and a review's grounded `Finding[]`.
  `citation_accuracy` needed no new engine code — it's
  `kept.length / (kept.length + dropped.length)`, already implicit in
  `ReviewOutcome.review.findings`/`ReviewOutcome.dropped`.
- `server/src/modules/eval/` — CRUD on `eval_cases`; `runCase` (parses
  `input_diff` via the existing `parseUnifiedDiff`, resolves the owning
  agent's linked+enabled skills the same way `run-executor.ts` does, calls
  `reviewPullRequest`, scores, persists); `runAllForWorkspace` (the dashboard
  batch); `statsForAgent` (the Evals tab's display-only metrics rollup,
  averaged over each case's latest run); `dashboard` (workspace summary +
  trend + recent runs).
- Client: Agent Editor `EvalsTab` (metrics header, case list with
  never-run/pass/fail state, per-case Run/Edit/Delete) + `EvalCaseEditorModal`
  (Name, Diff/PR-meta input tabs, expected-output JSON editor with a live
  valid/invalid badge and a "+ Finding skeleton" helper, Run-on-save), and
  the global `/eval` dashboard (metric trend line chart, recent-runs table,
  "Run eval (N)").

## Scope cuts (unchanged from the original gap analysis)

- Only `owner_kind: 'agent'` cases can be RUN — the schema/API still accepts
  `'skill'` on create, but nothing exercises it; a skill-owned run would need
  a "baseline agent + this skill" concept that doesn't exist.
- No "Files" input tab — the mockup shows one, but `eval.json`'s
  `caseEditor.tabs` only ever defined `{diff, prMeta}`, and
  `reviewPullRequest` has no slot for extra file contents beyond the diff.
  `input_files` stays an accepted-but-unused jsonb column.
