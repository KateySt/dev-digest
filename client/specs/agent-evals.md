# Spec: Evals — regression harness for reviewer agents (client)
Spec ID: SPEC-01
Status: draft
Supersedes: none

Server side: [`../../server/specs/eval.md`](../../server/specs/eval.md) (SPEC-02) — owns scoring, run lifecycle, and API contracts.
Design references: `docs/design/evals/01-finding-card-turn-into-eval.png`, `02-eval-dashboard.png`, `03-agent-eval-detail.png`, `04-compare-runs-modal.png`, `05-agent-editor-evals-tab.png`, `06-eval-case-modal.png`, `proto-evals-tab.png`.

## Changelog
- 2026-10-06 — Resolved all open questions: Learn split out to a future spec (button kept in the action row but rendered disabled with a "Coming soon" tooltip); Reply shows "Posted · View on GitHub" after reload and allows no second reply; Promote confirmation warns that skill text is not rolled back and surfaces a missing-skill 409; range filter applies only to the trend chart and run table. ACs renumbered.
- 2026-10-06 — Evolved into a versioned regression harness UI: FindingCard gains "Turn into eval case", Learn, and Reply to author (Learn later split out — see the newer entry above); the Evals tab shows must find / must not flag badges and metrics from the latest suite run with deltas; the global Eval Dashboard becomes a cross-agent overview with "Run all agents"; new per-agent dashboard (range filter, regression banner, metric cards with sparklines, trend chart, selectable run history); new Compare runs modal with Promote vN; background-run progress. Status moved back to `draft`. Already built before this change and kept: Evals tab case list with per-row Run/Edit/Delete, Eval Case Editor modal (Name, Diff/PR-meta tabs, expected-output JSON editor with valid badge, "+ Finding skeleton", Run on save, Run case), `/eval` page in the sidebar.
- 2026-10-06 — Prior content (pre-changelog): Evals tab + Eval Case Editor + workspace Eval Dashboard built on `EvalCase`/`EvalCaseRun`/`EvalCaseListItem`; Files tab cut.

## Problem and user
An agent author changes a reviewer agent's prompt, model, or skills and needs
to see, in the studio, whether the agent got better or worse — using cases
built from their own accept/dismiss decisions, comparing versions side by side.

## Goals / Non-goals
Goals
- One-click "Turn into eval case" on decided findings; Reply to author on every finding.
- See an agent's case set, run it, watch progress, and read recall / precision / citation accuracy with deltas.
- Per-agent history with range filter, regression banner, two-run compare with config diff, and Promote.
- Cross-agent dashboard with "Run all agents".

Non-goals
- No "Files" input tab in the case editor (Diff and PR meta only).
- No cost-limit confirmation before a run.
- Eval runs never appear on Stats or Agent Performance screens.
- Single-case runs never appear in run history or compare.
- **Learn** behavior is split out to a separate future spec (decisions carried over: inject all repo `learning` Memory entries newest-first, max 20, no embeddings, never in eval runs). This spec only reserves its slot in the action row (AC-6).

## User stories
None beyond the goals.

## Acceptance criteria (EARS)

### FindingCard (PR review screen)
- AC-1: WHEN a finding card is expanded, the system shall show the action row Accept / Dismiss / Learn / Turn into eval case / Reply to author. (verify via: unit test)
- AC-2: WHEN the user clicks "Turn into eval case" on an accepted or dismissed finding, the system shall create the case and show a confirmation naming the case kind ("must find" or "must not flag") with a link to the case in the agent's Evals tab. (verify via: unit test)
- AC-3: IF the finding is neither accepted nor dismissed, THEN the system shall render "Turn into eval case" disabled with the tooltip "Accept or dismiss first". (verify via: unit test)
- AC-4: WHEN a finding already has an eval case (from load or from a 409 response), the system shall render the button as "In eval set" linking to that case. (verify via: unit test)
- AC-5: IF the finding's review has no agent, THEN the system shall render "Turn into eval case" disabled with a tooltip explaining that only agent reviews can seed cases. (verify via: unit test)
- AC-6: WHEN the action row renders, the system shall show Learn disabled with the tooltip "Coming soon" and trigger no request on click. (verify via: unit test)
- AC-7: WHEN the user clicks "Reply to author", the system shall open a confirmation dialog showing the target file:line and an editable comment body prefilled from the finding's title, rationale, and suggestion, and post nothing until the user confirms. (verify via: unit test)
- AC-8: WHEN a finding has a posted reply (just posted or loaded after reload), the system shall render Reply to author as "Posted · View on GitHub" linking to the comment and offer no second reply. (verify via: unit test)
- AC-9: IF posting the reply fails, THEN the system shall keep the dialog open with the server's error message and the user's edited body intact. (verify via: unit test)

### Agent Editor — Evals tab
- AC-10: WHEN the Evals tab loads, the system shall show Recall, Precision, and Citation accuracy from the agent's latest finished suite run, each with a signed point delta vs. the previous finished suite run, plus "Traces passed x/y". (verify via: unit test)
- AC-11: IF a metric is null or no suite run exists, THEN the system shall show "—" for that value and no delta. (verify via: unit test)
- AC-12: WHEN the Evals tab shows the case list, the system shall display "N / M passing" where M counts only cases that have a result, and separately the total case count. (verify via: unit test)
- AC-13: WHEN a case row renders, the system shall show its status icon (pass / fail / never run / errored), name, a "must find" or "must not flag" badge with the tooltip "Seeded from an accepted finding" / "Seeded from a dismissed finding" (no seed tooltip for manual cases), and its summary ("expected N findings, got M", or for must not flag "expected 0 findings at file:L–L, got N", or "never run"). (verify via: unit test)
- AC-14: WHERE a must not flag case has no forbidden locations, the system shall show the chip "assert empty". (verify via: unit test)
- AC-15: WHEN the tab renders metrics, the system shall show the note "Scoring is mechanical — a finding counts when file matches and line ranges overlap. No model call in the scorer." (verify via: unit test)
- AC-16: WHEN the user clicks "Run all evals", the system shall start a suite run for the agent and label the button with the number of cases to be reviewed before the click. (verify via: unit test)
- AC-17: WHILE the agent's suite run is running, the system shall disable "Run all evals" and show "Running X/Y…" updated by polling until the run is completed or failed. (verify via: unit test)
- AC-18: WHEN a suite run finishes, the system shall refresh the metrics and case list without a page reload. (verify via: unit test)
- AC-19: WHEN the user clicks "View full dashboard →", the system shall navigate to that agent's per-agent dashboard. (verify via: unit test)

### Eval Case Editor modal
- AC-20: WHEN the user creates a case via "+ New eval case", the system shall let them choose kind must find or must not flag, and save it as a manual case. (verify via: unit test)
- AC-21: WHEN the user edits the diff or expected output of a case that has at least one result, the system shall show a warning that runs before and after the edit are not directly comparable. (verify via: unit test)
- AC-22: WHERE the case is must not flag, the system shall label the JSON editor as forbidden locations and offer a location skeleton ({file, start_line, end_line}) instead of a finding skeleton. (verify via: unit test)

### Per-agent dashboard
- AC-23: WHEN the per-agent dashboard loads, the system shall show the agent name, model chip, "N runs on the M-case set", an agent picker that switches agent, a range selector, and "Run eval". (verify via: unit test)
- AC-24: WHEN the user picks a range of 7, 30, or 90 days or All (default 30 days), the system shall filter both the trend chart and the recent-runs table to that range. (verify via: unit test)
- AC-25: WHEN the range changes, the system shall keep the metric cards and the regression banner on the latest finished run vs. the previous one, regardless of range. (verify via: unit test)
- AC-26: WHEN the server returns a regression alert, the system shall show it in a warning banner above the metric cards; WHEN it returns none, the system shall show no banner. (verify via: unit test)
- AC-27: WHEN the dashboard renders, the system shall show three metric cards (Recall, Precision, Citation accuracy) with latest value, signed delta vs. previous run, and a sparkline. (verify via: unit test)
- AC-28: WHEN the dashboard renders, the system shall show a three-series metric trend chart and a recent-runs table with checkbox, ran at, version, recall/precision/citation bars with percentages, pass x/y, cost, and status (running / completed / failed). (verify via: unit test)
- AC-29: WHILE exactly two runs are selected, the system shall enable Compare and show "2 selected"; otherwise Compare shall be disabled. (verify via: unit test)
- AC-30: IF the agent has no suite runs, THEN the system shall show an empty state prompting "Run eval". (verify via: unit test)

### Compare runs modal
- AC-31: WHEN Compare is opened, the system shall order the two runs old → new by version and show the title "Compare runs · vOld → vNew". (verify via: unit test)
- AC-32: WHEN Compare renders, the system shall show Recall, Precision, Citation, and Cost cards as old → new with ▲/▼ deltas, coloring a drop red and a rise green, except cost where a rise is red. (verify via: unit test)
- AC-33: WHEN Compare renders, the system shall show a line diff of the two system prompts (added lines highlighted, removed lines marked) and model and skills (with versions) as before → after. (verify via: unit test)
- AC-34: WHEN the server flags differing case sets or edited cases, the system shall show "case sets differ (X vs Y)" and/or "N cases edited between runs" in the modal. (verify via: unit test)
- AC-35: WHEN the user clicks "Promote vN" and confirms, the system shall promote that version, close the modal, and show the agent's new current version. (verify via: unit test)
- AC-36: WHEN the Promote confirmation opens, the system shall warn that skills are re-linked with their current text, not the text at that version. (verify via: unit test)
- AC-37: IF promote responds 409 for deleted skills, THEN the system shall show the missing skill names and leave the agent unchanged. (verify via: unit test)
- AC-38: IF the selected newer run's version is already the agent's current config, THEN the system shall hide or disable Promote for it. (verify via: unit test)

### Cross-agent Eval Dashboard (`/eval`)
- AC-39: WHEN `/eval` loads, the system shall show the header "Regression harness across all reviewer agents", an agents list (name, model chip, "Last run vN · date · x/y pass", sparkline, recall/prec/cite %, chevron to the per-agent dashboard), and a "Recent eval runs · all agents" table (agent, ran at, version, metric bars, pass x/y). (verify via: unit test)
- AC-40: WHEN the user clicks "Run all agents", the system shall start runs for all eligible agents and show per-agent running state until each finishes. This replaces the previous "Run eval (N)" button. (verify via: unit test)
- AC-41: IF an agent has never been run, THEN the system shall show "never run" and "—" metrics on its row. (verify via: unit test)

### End-to-end
- AC-42: WHEN a user turns an accepted finding into a case, runs the agent's evals, changes the system prompt, runs again, and compares the two runs, the system shall show both versions with deltas and the prompt diff. (verify via: e2e)

## Edge cases
- Long, unbroken file:line strings in case summaries and the compare modal shall wrap instead of overflowing (see `client/INSIGHTS.md` 2026-09-24: `overflowWrap: "anywhere"`, `minWidth: 0`, `minmax(0, 1fr)` grid tracks).
- A run that ends `failed` shows a failed status in the table and is excluded from deltas and the banner.
- Errored cases are shown in the run with their error, not counted in pass x/y.
- Sparkline or trend with a single point renders a dot, not an empty chart.
- Agent picker list includes only agents in the workspace; switching while a run polls keeps polling the original agent's run in the background.
- Promote is only shown in the compare modal.
- An older finding whose reply was posted from GitHub directly (not via the studio) is not detected; only studio-posted replies show "Posted".

## Non-functional requirements
- Polling: progress refreshes at most every 2 seconds while a run is running and stops when the run is no longer running.
- Accessibility: the run-history checkboxes and Compare button are keyboard-operable; disabled buttons expose their reason via tooltip/`aria-describedby`.
- Contracts: the client's `vendor/shared` shall gain the same new/changed contracts as the server's, including the currently missing `AgentVersionConfig`/`AgentVersion` (`client/INSIGHTS.md` 2026-09-30); verify parity by diffing only the touched files.
- i18n: all new strings go through `next-intl`.
- Imports in `client/src` use `@/` aliases.

## Inputs and provenance
- [reused: server] finding state, case lists, suite runs, compare payloads, regression alert text, dashboards — all computed server-side.
- [deterministic: client] old → new ordering, delta coloring, prompt line diff rendering, "N / M passing" counts.
- [new: 1 review per case per suite run] triggered by "Run all evals" / "Run eval" / "Run all agents" — executed server-side.
- [reused: finding] Reply body prefill.

## Untrusted inputs
- System prompts, diffs, PR text, and finding text are rendered as plain text (prompt diff and diff viewer render text, never HTML).
- Reply body is user-edited; it is shown verbatim in the confirmation step before posting.

## Module interactions / API contracts
Uses the server endpoints listed in SPEC-02 "Module interactions": `POST /findings/:id/eval-case`, `/reply`; `POST /agents/:id/eval-runs`; `GET /agents/:id/eval-runs?range=`; `GET /eval-suite-runs/:id`; `GET /agents/:id/eval-runs/compare`; `POST /agents/:id/versions/:version/promote`; `GET /eval-dashboard`; `POST /eval-dashboard/run-all`; existing case CRUD and `POST /eval-cases/:id/run`.

## Open questions
None — all resolved 2026-10-06.
