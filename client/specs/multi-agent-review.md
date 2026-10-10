# Spec: Multi-Agent Review & live statuses (UI)

Spec ID: SPEC-10
Status: draft
Supersedes: none

Server-side counterpart (`agentIds` on `POST /pulls/:id/review`, parent
multi-runs, the shared queue with `queued` status and queue position,
`GET /multi-agent-runs/:id`, grouping and disagreement rows, grounding in the
trace, per-agent estimates):
[`../../server/specs/multi-agent-review.md`](../../server/specs/multi-agent-review.md).
Its acceptance criteria are referenced below as `S-AC-N` and are assumed as
the data source; this spec does not restate them.

## Changelog

- 2026-10-10 — resolved every open question with the user and confirmed all
  assumed defaults (PR list row dropdown unchanged, Learn stays a stub).
  AC-2/AC-3: the PR dropdown lists open PRs of the repo selected in the sidebar
  repo switcher. AC-8/AC-9: the total time is a queue-aware estimate (waves of
  `REVIEW_CONCURRENCY`), and a missing estimate marks the total incomplete.
  AC-18: starting from the PR page navigates straight to the results page.
  AC-38/AC-39: no separate "Matched findings" section; grouped findings get an
  "Also flagged by …" badge on their card in both modes. AC-42/AC-43: coverage
  gaps among completed agents count as conflicts (server S-AC-39). Added AC-50
  (PR-header picker remembers the last selection), AC-51 ("Cancel all"),
  AC-52 (a Columns card opens Tabs focused on that finding) and AC-53 (last 10
  multi-runs listed on `/multi-agent`).
- 2026-10-10 — initial version

## Problem and user

The GLOBAL sidebar already has a "Multi-Agent Review" entry
(`/multi-agent`), but the page is a `FeaturePlaceholder`. On the PR detail
page, "Run Review" can start one agent or all of them, never a chosen set.
There is no screen that shows several agents' results side by side, no way to
see which agents agree or disagree about a location, and the per-run trace
(`RunTraceDrawer`) is reachable only from the PR page.

The user is a reviewer who wants to pick a PR (e.g. seed PR #482), pick
several specialised agents, see what that will roughly cost, watch each agent's
status while it runs, then compare findings — merged where they match, with
the original authors and text still available — and open any agent's trace or
log.

## Goals / Non-goals

**Goals**

- A **Configure run** screen at `/multi-agent`: PR picker, agent checkboxes
  with per-agent time/cost estimates, a total estimate, and a
  "Run multi-agent review (N)" button.
- A **PR page agent picker** in the PR detail header's "Run Review" dropdown,
  starting the same multi-run.
- A **results page** at `/multi-agent/[runId]` with two modes — Columns and
  Tabs + detail — showing each agent's live status, findings, score, duration
  and cost.
- **Matched findings** marked on each card with an "Also flagged by …" badge
  that expands into every original finding with its author.
- A **"Where agents disagree"** block with one cell per selected agent and a
  "Show only conflicts" toggle.
- **"View trace"** per agent opening the existing `RunTraceDrawer` (trace and
  live log).

**Non-goals**

- No change to the PR list row's "Run Review" dropdown.
- No "Learn" behavior — the action stays a disabled "coming soon" stub.
- No reason text for "did not flag" cells (the design's per-agent reason text
  is dropped — agents don't emit one).
- No agent editing from these screens; "Configure agents…" only navigates.
- No retry button for a single failed column; re-running starts a new
  multi-run from Configure run.
- No "fan-out via worktrees" wording — the product fans out through an
  in-process queue.

## Acceptance criteria (EARS)

**Configure run screen (`/multi-agent`)**

- AC-1: WHEN the user opens `/multi-agent`, the page shall show the title "Run
  a Multi-Agent Review", the subtitle, a "Pull request" step and an "Agents to
  run" step, with breadcrumb "Multi-Agent Review > Configure run". (verify
  via: unit test)
- AC-2: WHEN the PR dropdown opens, it shall list the open pull requests of
  the repo currently selected in the sidebar repo switcher as "#number ·
  title", with the placeholder "Select a pull request…" while none is chosen.
  (verify via: unit test)
- AC-3: WHERE `/multi-agent` is opened with `?pr=<prId>` for an open PR of the
  selected repo, that PR shall be preselected. IF the id is not an open PR of
  the selected repo, THEN no PR shall be preselected and no error page shall be
  shown. (verify via: unit test)
- AC-4: WHILE no PR is selected, the agents step shall show the dashed empty
  state "Pick a pull request first — Choose which PR to review above, then
  select the agents to run on it." instead of agent cards. (verify via: unit
  test)
- AC-5: WHEN a PR is selected, the agents step shall show one card per enabled
  agent with a checkbox, icon, name, one-line description and a right-aligned
  estimate "<duration>s · $<cost>". (verify via: unit test)
- AC-6: IF an agent has no estimate (S-AC-43), THEN its card shall show "—"
  for the missing figure, never "0s" or "$0.00". (verify via: unit test)
- AC-7: WHEN the user clicks "Select all", every agent card shall become
  checked. (verify via: unit test)
- AC-8: WHEN one or more agents are checked, the footer shall show the total
  "≈ <duration>s · $<sum cost> · parallel fan-out", labelled as an estimate,
  where cost is the sum of the checked agents' cost estimates and duration is
  a greedy queue simulation with `REVIEW_CONCURRENCY` slots (S-AC-47): sort
  the checked agents' duration estimates descending, assign each in turn to the
  slot that frees earliest, and take the latest slot end. With no more agents
  than slots this equals the longest estimate. (verify via: unit test)
- AC-9: IF any checked agent has no duration or cost estimate, THEN that agent
  shall be left out of the corresponding figure and the total shall read as
  incomplete ("incomplete — <n> agent(s) without history"), never treating the
  missing value as 0. (verify via: unit test)
- AC-10: WHILE no PR is selected or zero agents are checked, the "Run
  multi-agent review (N)" button shall be disabled; otherwise it shall be
  enabled and N shall equal the number of checked agents. (verify via: unit
  test)
- AC-11: WHEN the user clicks "Run multi-agent review (N)", the client shall
  send exactly the checked agent ids as `agentIds` to `POST /pulls/:id/review`
  and, on success, navigate to `/multi-agent/<multi_agent_run_id>`. (verify
  via: unit test)
- AC-12: IF the start request returns 409 `review_in_progress` (S-AC-7), THEN
  the screen shall stay, show an inline error saying a review is already
  running for this PR, and link to the in-flight multi-run results page when
  the error carries a `multi_agent_run_id`, otherwise to the PR page. (verify
  via: unit test)
- AC-13: IF the start request fails for any other reason, THEN the screen shall
  stay with the selection intact and show the error; the button shall be
  usable again. (verify via: unit test)
- AC-14: WHILE the start request is in flight, the button shall be disabled
  so a double click cannot start two runs. (verify via: unit test)
- AC-15: IF the workspace has no enabled agents, THEN the agents step shall
  show the existing "Enable agents to run reviews" empty state with a link to
  Agents. (verify via: unit test)

**PR page agent picker**

- AC-16: WHEN the user opens "Run Review" in the PR detail header, the dropdown
  shall show "PICK AGENTS TO RUN", a "Clear" action, one checkbox per enabled
  agent with its "~<duration>s" estimate, a "Run multi-agent review (N)"
  button and a "Configure agents…" link. (verify via: unit test)
- AC-17: WHILE zero agents are checked in the dropdown, its run button shall be
  disabled. (verify via: unit test)
- AC-18: WHEN the user clicks the dropdown's run button, the client shall start
  a multi-run with the checked agent ids (same request as AC-11) and, on
  success, navigate immediately to `/multi-agent/<multi_agent_run_id>` with
  live columns; a 409 or other failure shall be shown in place, as in AC-12 /
  AC-13. (verify via: unit test)
- AC-19: WHEN the user clicks "Configure agents…", the client shall navigate to
  `/multi-agent?pr=<prId>` for the current PR. (verify via: unit test)
- AC-20: WHEN a run on the PR page is `queued`, the existing run status shall
  render it as queued with its queue position, not as an unknown status.
  (verify via: unit test)

**Results page (`/multi-agent/[runId]`)**

- AC-21: WHEN the results page loads, it shall show the breadcrumb
  "Multi-Agent Review > #<number>", a "Configure run" button, the title, "<N>
  selected agents · parallel", a Columns/Tabs toggle, the PR number and title,
  and "<N> agents · fan-out via shared queue · <duration>s total · $<cost>".
  (verify via: unit test)
- AC-22: WHEN the user clicks "Configure run", the client shall navigate to
  `/multi-agent?pr=<prId>`. (verify via: unit test)
- AC-23: WHILE any agent of the multi-run is `queued` or `running`, the page
  shall re-fetch the results at most every 4 seconds and stop once every agent
  is in a terminal state. (verify via: unit test)
- AC-24: WHILE the totals are partial (S-AC-22), the header's duration and cost
  shall be marked as running/partial; IF total cost is null, THEN cost shall
  show "—", not "$0.00". (verify via: unit test)
- AC-25: WHEN the page is reloaded mid-run, it shall show the same per-agent
  statuses as before the reload, derived from the server. (verify via: unit
  test)
- AC-26: IF the multi-run does not exist or is in another workspace (404), THEN
  the page shall show a not-found state with a link back to Configure run.
  (verify via: unit test)

**Columns mode**

- AC-27: WHEN Columns mode is active, the page shall show one column per
  selected agent, in selection order, each with icon, name, "<duration>s ·
  $<cost>", a 0–100 score ring, its finding cards (severity icon, title,
  file:line), and a footer with "View trace" and "<N> findings". (verify via:
  unit test)
- AC-28: WHILE a column's agent is `queued`, the column shall show "Queued ·
  #<position> in line" and a cancel action, and no score or findings. (verify
  via: unit test)
- AC-29: WHILE a column's agent is `running`, the column shall show a running
  indicator, elapsed time and a skeleton finding list, and a cancel action.
  (verify via: unit test)
- AC-30: IF a column's agent `failed`, THEN the column shall show a failed
  state with the error message, keep "View trace", and every other column shall
  render normally. (verify via: unit test)
- AC-31: IF a column's agent was `cancelled`, THEN the column shall show a
  cancelled state, distinct from failed. (verify via: unit test)
- AC-32: WHEN an agent finishes with zero findings, its column shall show its
  score and an explicit "No findings" state. (verify via: unit test)
- AC-33: WHEN the user clicks a queued or running column's cancel action, the
  client shall call `POST /runs/:id/cancel` for that run only. (verify via:
  unit test)

**Tabs mode**

- AC-34: WHEN Tabs mode is active, the page shall show one tab per selected
  agent labelled "<name> <score>" (status instead of score while not done), an
  agent summary card (score ring, name, summary, "View trace", duration ·
  cost), and expandable finding cards with severity badge, title, category
  chip, file:line link and "<confidence>% conf". (verify via: unit test)
- AC-35: WHEN a finding card is expanded, it shall show the rationale as
  sanitized markdown, a "Suggested fix" section when a suggestion exists, and
  Accept, Dismiss, Learn (disabled) and Turn into eval case actions. (verify
  via: unit test)
- AC-36: WHEN Accept, Dismiss or Turn into eval case is used on a card, it shall
  act on that card's own finding id with the same behavior as on the PR page.
  (verify via: unit test)
- AC-37: WHEN the user switches between Columns and Tabs, the choice shall be
  kept in the URL so it survives reload. (verify via: unit test)

**Matched findings ("Also flagged by")**

- AC-38: WHEN a finding belongs to a group with members from other agents
  (S-AC-28), its card shall show an "Also flagged by <agent>, <agent>" badge,
  in both Columns and Tabs modes; there shall be no separate "Matched findings"
  section. (verify via: unit test)
- AC-39: WHEN the user expands the "Also flagged by" badge, the card shall
  reveal each other member's original finding — agent, severity, confidence,
  original title, rationale and suggestion (sanitized markdown) — each with its
  own Accept and Dismiss acting on that member's finding id (S-AC-34). (verify
  via: unit test)

**Where agents disagree**

- AC-40: WHEN the results include disagreement rows, the page shall show a
  "Where agents disagree" block below the results in both modes, each row
  labelled "<file>:<line>  <title>" with one cell per selected agent only.
  (verify via: unit test)
- AC-41: WHEN a cell is rendered, it shall show the agent name and the
  severity label (e.g. "SUGGESTION", "WARNING") if it flagged the row, "did not
  flag" for `not_flagged`, "failed" or "cancelled" for those states, and
  "pending" while the agent is queued or running. (verify via: unit test)
- AC-42: WHEN "Show only conflicts" is switched on, only rows whose
  `is_conflict` flag is true (S-AC-39) shall be shown — rows where a completed
  agent did not flag the location, or flagging agents' severities differ;
  switching it off shall show every row again. (verify via: unit test)
- AC-43: IF the multi-run has no findings, THEN the block shall show an empty
  state saying there is nothing to compare. IF the toggle hides every row, THEN
  the block shall say every completed agent flagged every location with the
  same severity. (verify via: unit test)

**Trace and log**

- AC-44: WHEN the user clicks "View trace" on a column or summary card, the
  page shall open `RunTraceDrawer` for that agent's run with its
  Configuration, Stats, Prompt assembly, Tool calls, Raw output sections, Log
  tab and "Copy raw output" footer, and the URL shall carry `?trace=<runId>`
  so it survives reload. (verify via: unit test)
- AC-45: WHILE the traced run is `queued` or `running`, the drawer shall
  receive `running` so its Log tab streams live via `LiveLogStream`; WHEN the
  run reaches a terminal state, the drawer shall stop streaming and load the
  final trace. (verify via: unit test)
- AC-46: IF the traced run is `queued` and has no trace yet, THEN the drawer
  shall say the run has not started yet, not show an error. (verify via: unit
  test)
- AC-47: WHEN a trace includes the grounding result (S-AC-40), the drawer shall
  show kept/total and list every dropped finding with title, file:line and
  drop reason; IF the trace predates that field, THEN it shall show only the
  existing "k/n passed" figure. (verify via: unit test)
- AC-48: WHEN the PR page opens the trace drawer for a running run, it shall
  also pass `running`, so its log streams live there too. (verify via: unit
  test)

**Validation scenario**

- AC-49: WHEN three seed agents are run on seed PR #482 in the live app, the
  columns shall each update from queued/running to a terminal status without a
  manual reload, a failed agent shall not hide the others' results, the
  matched findings and disagreement block shall render, and every column's
  "View trace" shall show tokens, cost and the grounding decision. (verify via:
  manual check)

**Follow-ups confirmed 2026-10-10**

- AC-50: WHEN the user starts a run from the PR-header picker, the client shall
  store the checked agent ids in `localStorage` keyed per workspace; WHEN the
  picker next opens in that workspace, those agents shall be pre-checked,
  ignoring ids that are no longer enabled agents. "Clear" shall uncheck all.
  (verify via: unit test)
- AC-51: WHILE any agent of the multi-run is `queued` or `running`, the results
  page shall show a "Cancel all" action that calls the multi-run cancel
  endpoint (S-AC-45) after the user confirms; WHEN every agent is terminal, the
  action shall not be shown. (verify via: unit test)
- AC-52: WHEN the user clicks a finding card in Columns mode, the page shall
  switch to Tabs mode with that agent's tab selected and that finding expanded
  and scrolled into view. (verify via: unit test)
- AC-53: WHEN the user opens `/multi-agent`, the page shall list the last 10
  multi-runs of the workspace (S-AC-24) with PR number and title, run time,
  agent count, status and totals, each linking to its results page; IF there
  are none, THEN the list shall be omitted. (verify via: unit test)

## Edge cases

- **More agents than queue slots.** With 5 agents and the default limit of 3,
  two columns start as "Queued · #1/#2 in line"; positions can be higher when
  other PRs' runs are queued (server-wide queue).
- **Browser connection limit.** Browsers allow ~6 concurrent HTTP/1.1
  connections per host. An `EventSource` per column plus polling would exhaust
  them and stall the page, so columns use polling only and the single live log
  stream is the open drawer's (AC-29, AC-45).
- **Groups change while running.** "Also flagged by" badges and disagreement rows are
  recomputed by the server as agents finish; cells show "pending" until then,
  never "did not flag" (AC-41).
- **Long unbroken `file:line` strings** in finding cards, group members and
  disagreement row labels must wrap (`overflowWrap: anywhere`, `minWidth: 0`,
  `minmax(0, 1fr)` grid tracks — `client/INSIGHTS.md` 2026-09-24), otherwise
  narrow columns overflow the page.
- **Many columns.** Five columns do not fit narrow screens; Columns mode
  scrolls horizontally rather than squeezing cards below readable width.
- **`?pr=` for another repo.** "Configure agents…" passes the PR id; if the
  sidebar's selected repo is a different one, the PR is not in the dropdown and
  is not preselected (AC-3). `?pr=` always uses the PR id, never the number.
- **Navigation after starting from the PR page (AC-18).** None of the current
  e2e flows (`e2e/specs/*.flow.json`) start a review from the PR header, so
  none break; any new flow that does must expect to land on
  `/multi-agent/<id>`, and PR-page tests of the old "stay on page" behavior
  must be updated.
- **Grouped finding shown in several columns.** A group with members from three
  agents shows a badge on the card in each of those three columns (AC-38); each
  column still shows its own original.
- **Stored picker selection is stale.** Agents deleted or disabled since the
  last run are dropped from the pre-check (AC-50); if none remain, the picker
  opens with nothing checked.
- **Severity count display.** A column footer's "N findings" and any severity
  counts reuse `SeverityCountBadges`, the same cluster the PR list and run
  history use (`client/INSIGHTS.md`, same affordance on every screen).
- **Disabled hover/expand triggers.** A group or card whose detail is fetched
  lazily must not be disabled before its data has loaded
  (`client/INSIGHTS.md` 2026-09-15).
- **Agent with no history.** Its estimate is "—" and the total is marked
  incomplete (AC-6, AC-9).
- **Estimate vs reality.** The total time accounts for this multi-run's own
  agents queueing (AC-8), but not for other runs already in the server-wide
  queue; a busy queue makes wall-clock longer than the estimate.
- **Run started, then the user leaves.** Runs continue server-side; returning
  to `/multi-agent/<id>` shows the current state (AC-25).
- **Server restart mid-run.** Columns that were queued or running become
  failed with a "server restarted" reason (S-AC-18).

## Non-functional requirements

- **Status freshness.** A column status change is visible within ~5 s (4 s
  poll + render) without a reload (AC-23).
- **Cost honesty.** No figure renders an unknown value as 0 (AC-6, AC-9,
  AC-24); the header uses "fan-out via shared queue" wording, not "worktrees".
- **Accessibility.** Column statuses are announced as text (not only by color
  or icon); the Columns/Tabs toggle and the conflicts toggle expose their state
  to assistive technology; agent checkboxes are real labelled checkboxes;
  severity is never conveyed by color alone.
- **Rendering cost.** Polling replaces the results data in place; expanded
  cards, the selected tab and the open drawer stay open across refetches.
- **i18n.** All new strings go through the existing `runs` messages namespace
  (`client/messages/en/runs.json` `page.*` keys are the starting point and are
  updated where the design wording changed).

## Inputs and provenance

- [deterministic: server data] Open PRs, enabled agents, estimates (S-AC-42),
  multi-run results, groups and disagreement rows (S-AC-19 … S-AC-39).
- [deterministic: computed by code] Total estimate — max of checked agents'
  durations and sum of their costs (AC-8).
- [reused: existing run trace and log stream] Drawer content, via the existing
  trace and SSE endpoints.
- [new: N LLM calls] Clicking "Run multi-agent review (N)" starts N paid agent
  runs (server). The client itself makes no LLM calls.

## Untrusted inputs

- **Finding titles, rationale, suggestions and file paths are LLM output.**
  Rationale and suggestions render through the existing sanitized markdown
  renderer used by `FindingCard` (no raw HTML, no script/`javascript:` URLs);
  titles, file paths and disagreement row labels render as plain text, never
  as HTML.
- **Dropped-finding entries in the trace** are LLM output as well — plain text.
- **Raw model output and log lines** in the drawer render as plain/pre text,
  as today.
- **PR titles** come from GitHub and render as plain text in the dropdown and
  header.
- **`?pr=`, `?trace=` and the `[runId]` route segment** are identifiers passed
  to the API, never rendered as HTML or used to build a URL to another origin.

## Module interactions / API contracts

- **Server endpoints used:** `POST /pulls/:id/review` with `agentIds`
  (S-AC-1), `GET /multi-agent-runs/:id` (S-AC-19), `GET
  /multi-agent-runs?limit=10` (S-AC-24, recent list — AC-53),
  `POST /multi-agent-runs/:id/cancel` (S-AC-45, AC-51), the estimates endpoint
  with the queue limit (S-AC-42, S-AC-47), the selected repo's open PR list
  (`GET /repos/:id/pulls`), `POST /runs/:id/cancel`, `GET
  /runs/:id/trace`, `GET /runs/:id/events`, `POST /findings/:id/accept|dismiss`,
  `POST /findings/:id/eval-case`.
- **Shared contracts** (`RunRequest`, `MultiAgentRun` and friends, `RunTrace`)
  change in both `vendor/shared` trees by hand; diff only the touched files
  (`client/INSIGHTS.md` 2026-09-30).
- **`RunTraceDrawer` and `FindingCard` are promoted to a shared location**
  (`client/src/components/...`), since both the PR page and the results page
  now use them; behavior on the PR page stays the same apart from AC-48.
- **`RunReviewDropdown`** is shared by the PR list row and the PR detail
  header; only the header gets the agent picker (AC-16), so the two need
  separate variants.
- **Routes:** `/multi-agent` (Configure run), `/multi-agent/[runId]`
  (results). The sidebar entry in `client/src/vendor/ui/nav.ts` already points
  at `/multi-agent`; `vendor/ui` is not edited.

## Open questions

None. Every question from the initial draft was resolved with the user on
2026-10-10 — see the changelog.
