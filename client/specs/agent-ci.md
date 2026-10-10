# Spec: Agent Editor CI tab, Export to CI wizard, CI Runs page

Spec ID: SPEC-03
Status: implemented
Supersedes: none

Server-side counterpart (generation, lint, export, verified ingest, CI Runs
API): [`../../server/specs/ci.md`](../../server/specs/ci.md). Its acceptance
criteria are referenced here as `S-AC-N` and are not restated. Approved plan:
`C:\Users\User\.claude\plans\spicy-sauteeing-kurzweil.md`. Design reference:
`docs/design/export-ci/*.png` (ci-tab, wizard-1..4, ci-runs; to be saved by
plan step 0b).

## Changelog

- 2026-10-10 — Security hardening + sync filtering, aligning the spec with
  the implemented, user-accepted behavior. AC-18: changing triggers after a
  manual workflow edit regenerates the workflow and discards the edit, with a
  notice on the Configure step. AC-19: the zero-trigger state also shows a
  "select at least one trigger" hint. AC-25: the Install step displays the
  server's distinct not-found/forbidden error as well as the
  `pat_workflow_scope` one (S-AC-25).
- 2026-10-10 — Rewritten in place for the "Export to CI" redesign. The
  one-step `PublishDialog` is replaced by a 4-step Export wizard (Target,
  Preview, Configure, Install). Only GitHub Actions is selectable; CircleCI,
  Jenkins and Generic CLI are disabled "Coming soon" stubs. The CI tab now
  shows installations with workflow version and an out-of-date flag, a Fail CI
  on card and recent history. The CI Runs page adds Repository, Verdict and
  Job link columns, a source filter, and a Refresh that calls sync. All
  requirements carry EARS AC-N ids (AC-1 – AC-34). Status moved from
  `implemented` back to `draft` because the new design is not built. No new
  automated tests this iteration (user decision); existing `PublishDialog` /
  `CiTab` tests are adapted or deleted with the code they cover.
- 2026-09-19 — initial version: one-step Publish to CI dialog; the multi-target
  wizard was out of scope.

## Problem and user

A DevDigest user wants their tuned agent to review every PR in a target repo
automatically. Today the CI tab offers a one-step "Publish" dialog whose
workflow cannot run. The Fail CI on setting is editable only in the Config
tab, and nothing tells the user that an installation no longer matches the
agent. The CI Runs page is always empty and cannot link a run to its trace or
its GitHub job.

## Goals / Non-goals

**Goals**

- A 4-step Export wizard that shows exactly what will be committed, lets the
  user edit the workflow safely, and installs it by PR or zip.
- A CI tab that shows where the agent is installed, whether each installation
  is current, recent CI history, and the Fail CI on policy.
- A CI Runs page that pulls fresh results on demand and links each run to its
  trace and its GitHub job.

**Non-goals**

- Working CircleCI, Jenkins or Generic CLI targets. They render only as
  disabled stubs.
- Reading, setting or validating repo secret values from the studio.
- A PR feed integration for CI runs, and multi-run or multi-agent UI changes.
- New automated tests in this iteration (unit, component or e2e).

## User stories

None beyond the goals.

## Acceptance criteria (EARS)

Verification hints: this iteration adds no automated tests (user decision).
Each AC names the method used now (`manual check` against the running app and
`docs/design/export-ci/*.png`, `code inspection`, `typecheck`). Where an
automated test would normally apply, the hint ends with "automated:
<category>, deferred".

### CI tab

- AC-1: WHEN the CI tab renders, the system shall show the heading
  "Continuous Integration" and "Active in N repos", where N is the number of
  installations. (verify via: manual check)
- AC-2: IF the agent has no installations, THEN the system shall show an empty
  state with an "Add to CI" button that opens the Export wizard. (verify via:
  manual check)
- AC-3: WHEN the agent has installations, the system shall render one row per
  installation. Each row shows repo, workflow version, last run status,
  relative last-run time and a link to the installation PR. (verify via:
  manual check)
- AC-4: WHILE an installation is reported `out_of_date` (S-AC-29), the system
  shall show an "Out of date" badge on its row and an "Update CI config"
  action. The action opens the wizard pre-filled with that repo, triggers and
  `post_as`. (verify via: manual check)
- AC-5: WHEN "+ Add repository" is clicked, the system shall open the Export
  wizard with an empty repo field. (verify via: manual check)
- AC-6: WHEN the CI tab renders, the system shall show a "Fail CI on" card
  with three segments: Critical, Warning+ and Never. They map to
  `ci_fail_on` values `critical`, `warning` and `never`, and the stored value
  is selected. (verify via: manual check)
- AC-7: WHEN a different Fail CI on segment is chosen, the system shall save
  it through the existing agent update hook. On success it shall refetch the
  agent's CI data so that affected installations show "Out of date". (verify
  via: manual check)
- AC-8: IF saving Fail CI on fails, THEN the system shall show an error toast
  and re-select the previously stored segment. (verify via: manual check)
- AC-9: WHEN the CI tab renders, the system shall list the agent's recent CI
  runs (S-AC-31). Each run shows status, repo and PR, relative time and a
  Trace link. (verify via: manual check)

### Export wizard

- AC-10: WHEN the wizard opens, the system shall show a stepper with Target,
  Preview, Configure and Install. The current step is highlighted, and Back
  and Continue buttons move between steps. (verify via: manual check)
- AC-11: WHEN the Target step renders, the system shall show GitHub Actions as
  the selected target. CircleCI, Jenkins and Generic CLI shall render as
  disabled cards with a "Coming soon" badge that cannot be selected by mouse
  or keyboard (`aria-disabled`). (verify via: manual check)
- AC-12: WHILE the Target step's repo field is not in `owner/name` form, the
  system shall keep Continue disabled. (verify via: manual check)
- AC-13: WHEN the Preview step renders, the system shall list every file from
  the server preview (S-AC-1). Long paths wrap inside the list instead of
  overflowing it. (verify via: manual check)
- AC-14: WHEN the Preview step lists `.devdigest/runner.mjs`, the system shall
  show only its size, runner version and hash, never its content. (verify via:
  manual check)
- AC-15: WHEN the Preview step renders, the system shall show
  `.github/workflows/devdigest-review.yml` in an editable text area. Other
  files are read-only. (verify via: manual check)
- AC-16: WHEN the server preview includes a model-mapping warning (S-AC-6),
  the system shall show that warning on the Preview step. (verify via: manual
  check)
- AC-17: WHEN Continue is clicked on the Preview step after the workflow was
  edited, the system shall submit the edited text for server lint. IF the
  server responds 422 (S-AC-20), THEN the system shall list each violation
  with its rule and location and stay on Preview. (verify via: manual check
  with a deliberately insecure edit)
- AC-18: WHEN the Configure step renders, the system shall show trigger chips
  `opened`, `synchronize` and `reopened`, all selected by default. IF the
  trigger selection changes after the workflow was manually edited on
  Preview, THEN the system shall discard the manual edit (the workflow is
  regenerated from the new triggers) and show a notice on the Configure step
  that the edits were discarded. (verify via: manual check)
- AC-19: WHILE no trigger chip is selected, the system shall keep Continue
  disabled on the Configure step and show a "select at least one trigger"
  hint. (verify via: manual check)
- AC-20: WHEN the Configure step renders, the system shall offer "Post results
  as" radios: GitHub review (default), PR comment, and None (exit code only).
  (verify via: manual check)
- AC-21: WHEN the Configure step renders, the system shall show a secrets
  table with rows `OPENROUTER_API_KEY` and `GITHUB_TOKEN`. Each row's status
  reads "verify in repo settings", and `GITHUB_TOKEN` is noted as provided by
  Actions. The table shall never display, request or read a secret value.
  (verify via: manual check, code inspection)
- AC-22: WHEN the Configure step renders, the system shall show a
  merge-blocking info box. It states the agent's current Fail CI on value and
  says that blocking a merge requires marking the check as required in branch
  protection. The old "Requires a GitHub App" text shall not appear. (verify
  via: manual check)
- AC-23: WHEN the Install step renders, the system shall offer two options.
  "Open a PR" names the repo, branch `devdigest/ci`, the title "Add DevDigest
  CI review" and the file count. "Download zip" is the second option.
  (verify via: manual check)
- AC-24: WHEN "Open a PR" is confirmed, the system shall call export
  (S-AC-21). While the request is in flight the system shall disable the
  button and show "Installing…". On success it shall show a done state with a
  link to the PR. (verify via: manual check)
- AC-25: IF export fails, THEN the system shall show an error message and
  stay on Install with the action re-enabled. The message shall distinguish
  the `pat_workflow_scope` error (PAT lacks the `workflow` scope) from the
  distinct not-found/forbidden error (repo not found, or the token has no
  access) (S-AC-25); any other failure shows the server's error message.
  (verify via: manual check)
- AC-26: WHEN "Download zip" is chosen, the system shall download the zip from
  S-AC-26 and shall not change the CI tab's installation list. (verify via:
  manual check)
- AC-27: WHEN an export succeeds, the system shall invalidate the agent-CI and
  CI-runs queries, so the CI tab shows the new or updated installation without
  a reload. (verify via: manual check; automated: component test, deferred)
- AC-28: IF the wizard is closed before Install, THEN the system shall discard
  its state and shall have made no export request. (verify via: manual check)

### CI Runs page

- AC-29: WHEN the CI Runs page renders, the system shall show these columns:
  timestamp, repository + PR, agent, source, duration, findings, cost,
  verdict, status, Trace and job link. (verify via: manual check against the
  ci-runs mockup)
- AC-30: WHEN the CI Runs page renders, the system shall offer the filters
  period (last 24 hours, last 7 days (default), last 30 days), agent, repo
  (options from `GET /ci-runs/repos`), status and source. A change refetches
  the list with all active filters. (verify via: manual check)
- AC-31: WHEN Refresh is clicked, the system shall call `POST /ci-runs/sync`,
  show "Refreshing…" with the button disabled, then refetch the list. IF sync
  fails, THEN the system shall show an error toast and keep the current rows.
  (verify via: manual check)
- AC-32: WHILE auto-refresh is on, the system shall run the same sync-and-
  refetch every 60 seconds. When auto-refresh is turned off, it shall stop.
  (verify via: manual check)
- AC-33: WHEN a row has a linked agent run, the system shall link Trace to the
  existing trace view for that run. The job link opens the row's `job_url` in a
  new tab with `rel="noopener noreferrer"`. (verify via: manual check)
- AC-34: IF a row's status is `failed` with an `ingest_error` (S-AC-36 –
  S-AC-39), THEN the system shall show the ingest error on that row and no
  Trace link. (verify via: manual check)

## Edge cases

- No CI runs at all: the existing empty state ("No CI runs yet") renders. Its
  copy refers to exporting, not publishing.
- Long repo names, PR titles and file paths wrap instead of overflowing table
  cells or the Preview list. Give the cell `overflowWrap: "anywhere"` and
  `minWidth: 0` (client INSIGHTS 2026-09-24).
- A stored `ci_fail_on` of `any` (valid in the shared enum but not one of the
  three segments): see Assumption A3.
- A repo is entered that already has an installation for this agent: the
  wizard proceeds as an update, and the server reuses the open `devdigest/ci`
  PR (S-AC-23).
- The server preview call fails on entering Preview: show the error and keep
  the user on Target with Continue re-enabled.

## Non-functional requirements

- **Security.** The UI never asks for, stores or shows secret values (AC-21).
  The job link opens with `noopener noreferrer` (AC-33).
- **Accessibility.** Disabled target cards expose `aria-disabled` and are
  skipped for selection by keyboard (AC-11). The stepper indicates the current
  step to assistive technology.
- **Conventions.** Hooks live in `src/lib/hooks/ci.ts` (TanStack Query skill
  applies). Imports use `@/`, and wizard parts are colocated
  `_components/<Name>/`. Types come from `@devdigest/shared`.

## Inputs and provenance

- [deterministic: server] installations, out-of-date flag, recent runs
  (`GET /agents/:id/ci`).
- [deterministic: server preview] file list, runner metadata, model-mapping
  warning, lint violations.
- [deterministic: user input] repo, edited workflow text, triggers,
  `post_as`, Fail CI on segment.
- [reused: ingested CI artifacts via server] CI Runs rows, including findings,
  cost, verdict and job URL.
- No LLM calls from the client: [new: 0 LLM calls].

## Untrusted inputs

- PR titles, repo names, `ingest_error` text and the edited workflow are
  rendered as plain text, never as HTML.
- `job_url` comes from GitHub's API through the server. It is opened only as
  an external link (AC-33).

## Module interactions / API contracts

The client calls only the server routes defined in S-AC-1 – S-AC-45:

- `GET /agents/:id/ci`
- `POST /agents/:id/ci/preview|export|zip`
- `POST /ci-runs/sync`
- `GET /ci-runs`
- `GET /ci-runs/repos`

Fail CI on is saved through the existing agent update endpoint and hook
(`lib/hooks/agents.ts`). Trace links reuse the existing trace view.

## Assumptions

Conservative choices made where the approved plan is silent. Each one is
listed in the handoff.

- A1: The target repo (`owner/name`) is entered on the Target step, under the
  target cards. The existing `exportWizard.repoLabel` i18n keys suggest this
  placement (AC-12).
- A2: Server lint runs when the user leaves Preview with an edited workflow,
  not on every keystroke (AC-17).
- A3: If the stored `ci_fail_on` is `any`, no segment is highlighted, and a
  caption shows the current value. Choosing a segment overwrites it.
- A4: Auto-refresh triggers sync + refetch every 60 seconds. The server
  throttles sync at 30 seconds (S-AC-33), so polling cannot hammer GitHub
  (AC-32).
- A5: Period filter options are 24 hours, 7 days (default) and 30 days
  (AC-30).
- A6: The Findings column reuses the existing per-severity badge cluster
  (`SeverityCountBadges`), as client INSIGHTS 2026-09-24 asks for every
  findings count. This is not stated in the plan.
- A7: Status was moved back to `draft` because the new design is
  unimplemented.

## Open questions

None blocking. Automated component and e2e tests for the AC-N above are
deferred to a later iteration by user decision.
