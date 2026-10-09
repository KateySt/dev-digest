# Spec: Skill evals — regression harness for skills (client)
Spec ID: SPEC-08
Status: draft
Supersedes: none

Server side: [`../../server/specs/skill-evals.md`](../../server/specs/skill-evals.md) (SPEC-08) — owns run lifecycle, draft runs, scoring, scan gating, and API contracts.
Builds on: [`agent-evals.md`](./agent-evals.md) (SPEC-01) — the shared Evals tab, Case Editor modal (amended there for structured fields), per-agent dashboard, and Compare modal patterns this spec mirrors for skills.
Design reference: `docs/design/evals/skill-editor-evals-tab.png` (Skill Editor · Evals).

## Changelog
- 2026-10-06 — Resolved open question: `empty []` replaces "assert empty" on both agent and skill Evals tabs (SPEC-01 AC-14 amended to match).
- 2026-10-06 — initial version

## Problem and user
A skill author changes a skill's text and needs to see, in the studio, whether
the skill got better or worse: run the skill's cases in the background, watch
progress, see metrics with deltas and a trend, compare two versions, and try
unsaved text before committing it as a new version. Today the Skill Editor's
Evals tab runs synchronously with no progress, no history, and no deltas, and
the header "Run on evals" button only switches tabs.

## Goals / Non-goals
Goals
- Skill Editor Evals tab with the same metrics/deltas/progress behavior as the agent Evals tab, plus a mini trend chart.
- Header "Run on evals" runs the unsaved Config text as a draft run.
- Per-skill dashboard (range, regression banner, metric cards, trend chart, run table, Compare) and Compare modal with Promote.
- `/eval` gains a Skills tab: cross-skill overview with "Run all skills".
- "Turn into eval case" on a finding can target the agent or one of its linked skills.

Non-goals
- Draft results never change case-row statuses, "N / M passing", metric tiles, the trend, or any dashboard.
- No host-agent picker for skill runs (skills always run in isolation).
- Skill eval runs never appear on Stats or Agent Performance screens.
- No new rollback UI — Promote calls the existing Versions tab Restore.

## User stories
- As a skill author, I edit the skill text in Config, click "Run on evals", see the draft fail a case, revert my edit, and see it pass again — without creating a version.

## Acceptance criteria (EARS)

### Skill Editor header
- AC-1: WHEN the Skill Editor renders, the system shall show the skill name, its type badge (e.g. `rubric`), the version chip, and a "Run on evals" button. (verify via: unit test)

### Run on evals (draft)
- AC-2: WHEN the user clicks "Run on evals" while the Config tab holds unsaved text different from the saved text, the system shall start a draft run with that text, switch to the Evals tab, and show a "Draft results" block with "Running X/Y…" progress. (verify via: unit test)
- AC-3: WHEN the user clicks "Run on evals" and the Config text equals the saved text, the system shall start a normal versioned suite run, as "Run all evals" does. (verify via: unit test)
- AC-4: WHEN a draft run finishes, the system shall show in the "Draft results" block a "draft" label, the pooled metrics, and each case's draft pass / fail / errored outcome with its summary. (verify via: unit test)
- AC-5: WHILE a draft run exists or runs, the system shall keep case-row statuses, "N / M passing", metric tiles, and the mini trend on the latest real (non-draft) suite run. (verify via: unit test)
- AC-6: WHEN the Evals tab loads and the server returns a latest draft run, the system shall show it in the "Draft results" block after a page reload. (verify via: unit test)

### Evals tab
- AC-7: WHEN the Evals tab loads, the system shall show Recall, Precision, and Citation accuracy from the skill's latest finished suite run with signed point deltas vs. the previous one, plus "Traces passed x/y"; a null metric or no run shows "—" and no delta. (verify via: unit test)
- AC-8: WHEN the Evals tab renders, the system shall show a mini trend chart of the last 10 finished suite runs with recall, precision, and citation lines and no range filter; a single run renders as a dot. (verify via: unit test)
- AC-9: WHEN the user clicks the mini trend chart, the system shall navigate to that skill's per-skill dashboard. (verify via: unit test)
- AC-10: WHEN the case list renders, the system shall show "N / M passing" where M counts only cases with a result, and the total case count in a separate chip. (verify via: unit test)
- AC-11: WHEN a case row renders, the system shall show its status icon (pass / fail / never run / errored), mono name, "must find" / "must not flag" kind badge, summary ("expected N findings, got M" or "never run"), a right chip (`SEVERITY · category` of the first expected finding for must find; `empty []` for a must not flag case with no forbidden locations, same as the agent tab per SPEC-01 AC-14), and Run / Edit / Delete buttons. (verify via: unit test)
- AC-12: WHEN the user clicks "Run all evals", the system shall start a suite run and label the button with the number of cases before the click. (verify via: unit test)
- AC-13: WHILE any run (suite or draft) of the skill is running, the system shall disable "Run all evals", "Run on evals", and per-row Run, and show "Running X/Y…" updated by polling until the run ends. (verify via: unit test)
- AC-14: WHEN a suite run finishes, the system shall refresh the metrics, mini trend, and case list without a page reload. (verify via: unit test)
- AC-15: IF the skill's scan status is blocking, `pending`, or `error`, THEN the system shall disable "Run all evals", "Run on evals", and per-row Run with a tooltip naming the scan state. (verify via: unit test)
- AC-16: IF the server refuses a run (scan not passed, run in progress, no cases), THEN the system shall show the server's message and start no polling. (verify via: unit test)
- AC-17: IF the skill has no eval cases, THEN the system shall disable "Run all evals" and "Run on evals" and show the empty state with "+ New eval case". (verify via: unit test)
- AC-18: WHEN the user clicks "View full dashboard →", the system shall navigate to the per-skill dashboard. (verify via: unit test)

### Per-skill dashboard
- AC-19: WHEN the per-skill dashboard loads, the system shall show the skill name, type badge, current version, "N runs on the M-case set", a skill picker, a range selector (7, 30, 90 days, All; default 30 days), and "Run eval". (verify via: unit test)
- AC-20: WHEN the range changes, the system shall filter the trend chart and the run table, and keep the metric cards and the regression banner on the latest finished run vs. the previous one. (verify via: unit test)
- AC-21: WHEN the server returns a regression alert (including "model changed between runs"), the system shall show it in a warning banner above the metric cards; WHEN none is returned, no banner. (verify via: unit test)
- AC-22: WHEN the dashboard renders, the system shall show three metric cards with latest value, signed delta, and sparkline, a three-series trend chart, and a run table with checkbox, ran at, version, model, metric bars, pass x/y, cost, and status. (verify via: unit test)
- AC-23: WHILE exactly two runs are selected, the system shall enable Compare and show "2 selected"; otherwise Compare shall be disabled. (verify via: unit test)
- AC-24: IF the skill has no suite runs, THEN the system shall show an empty state prompting "Run eval". (verify via: unit test)

### Compare runs modal (skills)
- AC-25: WHEN Compare opens, the system shall title it "Compare runs · vOld → vNew" and show Recall, Precision, Citation, and Cost cards old → new with ▲/▼ deltas (drop red, rise green; for cost a rise is red). (verify via: unit test)
- AC-26: WHEN Compare renders, the system shall show a line diff of the two versions' skill text and provider/model before → after, with a "model changed between runs" note when they differ. (verify via: unit test)
- AC-27: WHEN the server flags differing case sets or edited cases, the system shall show "case sets differ (X vs Y)" and/or "N cases edited between runs". (verify via: unit test)
- AC-28: WHEN the user clicks "Promote vN" and confirms, the system shall call the existing skill version Restore for vN, close the modal, and show the skill's new current version. (verify via: unit test)
- AC-29: IF the selected version is already the skill's current version, THEN the system shall hide or disable Promote for it. (verify via: unit test)

### `/eval` — Skills tab
- AC-30: WHEN `/eval` loads, the system shall show Agents and Skills tabs, with the existing cross-agent content under Agents. (verify via: unit test)
- AC-31: WHEN the Skills tab renders, the system shall list every skill (name, type badge, "Last run vN · date · x/y pass", sparkline, recall/prec/cite %, chevron to the per-skill dashboard) and a "Recent eval runs · all skills" table. (verify via: unit test)
- AC-32: IF a skill has never been run, THEN its row shall show "never run" and "—" metrics; IF it has no cases, THEN its row shall show "no cases". (verify via: unit test)
- AC-33: WHEN the user clicks "Run all skills", the system shall start runs, show per-skill running state until each finishes, and report how many skills were skipped. (verify via: unit test)

### FindingCard — Turn into eval case target
- AC-34: WHEN the user clicks "Turn into eval case" on a decided finding, the system shall let them choose the target: the finding's agent (default) or one of the skills currently linked to that agent. (verify via: unit test)
- AC-35: WHEN a case is created for a target, the system shall confirm with the case kind and a link to the case in that target's Evals tab. (verify via: unit test)
- AC-36: WHEN a finding already has a case for a target (from load or a 409), the system shall mark that target "In eval set" with a link to its case and keep the other targets selectable. (verify via: unit test)

### End-to-end
- AC-37: WHEN a user creates a skill case, runs the skill's evals, edits and saves the skill text, runs again, and compares the two runs, the system shall show both versions with deltas and the skill-text diff. (verify via: e2e)

## Edge cases
- Long case names and file:line strings wrap instead of overflowing (`client/INSIGHTS.md` 2026-09-24: `overflowWrap: "anywhere"`, `minWidth: 0`, `minmax(0, 1fr)` grid tracks).
- A run that ends `failed` (including "interrupted" after a server restart) shows a failed status and is excluded from deltas and the banner.
- Errored cases show their error and are not counted in pass x/y.
- Switching skills in the picker while a run polls keeps polling the original skill's run in the background.
- Skill deleted while its Evals tab or dashboard is open: the next fetch's 404 shows the existing skill not-found state.
- Legacy skill results (pre-suite-run) show as case results but never in the run table or trend.

## Non-functional requirements
- Polling: progress refreshes at most every 2 seconds while a run is running and stops when it ends.
- Accessibility: run-table checkboxes, Compare, and the target picker are keyboard-operable; disabled buttons expose their reason via tooltip / `aria-describedby`.
- Contracts: `client/src/vendor/shared` gains the same new/changed contracts as the server copy; verify by diffing only the touched files.
- i18n: all new strings go through `next-intl`.
- Imports in `client/src` use `@/` aliases.

## Inputs and provenance
- [reused: server] case lists, suite and draft runs, stats, compare payloads, regression alert text, dashboards, per-target case ids on findings.
- [reused: Config tab state] unsaved skill text sent as `draft_body`.
- [deterministic: client] old → new ordering display, delta coloring, skill-text line diff rendering, "N / M passing" counts.
- [new: 1 review per case per run] triggered by "Run all evals" / "Run on evals" / "Run eval" / "Run all skills" — executed server-side.

## Untrusted inputs
- Skill text (saved and draft), diffs, PR text, and finding text are rendered as plain text — the skill-text diff and diff viewer render text, never HTML/markdown-as-HTML.

## Module interactions / API contracts
Uses the server endpoints in SPEC-08 (server) "Module interactions": `POST /skills/:id/eval-runs`, `GET /skills/:id/eval-runs?range=`, `GET /eval-suite-runs/:id`, `GET /skills/:id/eval-runs/compare`, `GET /skills/:id/eval-stats`, `GET /eval-dashboard/skills`, `POST /eval-dashboard/skills/run-all`, `POST /findings/:id/eval-case` with `target`, existing `POST /skills/:id/versions/:version/restore`, and existing case CRUD / `POST /eval-cases/:id/run`. Stops calling the removed `POST /skills/:id/eval-cases/run-all`.

## Open questions
None — all resolved 2026-10-06.
