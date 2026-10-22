# Spec: Agent Editor CI tab, Export to CI wizard, CI Runs page

Spec ID: SPEC-03
Status: draft
Supersedes: none

Server-side counterpart (generation, lint, export, verified ingest, CI Runs
API): [`../../server/specs/ci.md`](../../server/specs/ci.md). Its acceptance
criteria are referenced here as `S-AC-N` and are not restated. Approved plan:
`C:\Users\User\.claude\plans\spicy-sauteeing-kurzweil.md`. Design reference:
`docs/design/export-ci/*.png` (ci-tab, wizard-1..4, ci-runs; to be saved by
plan step 0b).

## Changelog

- 2026-10-22 — Jenkins becomes a selectable, working target (AC-35 –
  AC-53), matching S-AC-46 – S-AC-86.
  - Wizard: Jenkins enabled on Target; the editable `Jenkinsfile` on
    Preview; Jenkins triggers (`opened` + `synchronize`), job name,
    credential IDs and agent label on Configure; an optional "create the
    Jenkins job" choice on Install.
  - A per-repository Jenkins connection dialog (not a global Settings
    section), reachable from Configure, the CI tab row and CI Runs errors.
  - Target badges, a Jenkins source filter, and per-installation sync
    errors with fix actions.

  AC-11's "Jenkins is a disabled Coming soon card" is superseded by AC-35
  (CircleCI and Generic CLI stay disabled). AC-18 – AC-22 and AC-23 –
  AC-25 still apply to Jenkins where not replaced below. Status moved
  from `implemented` to `draft`: the GitHub Actions UI stays implemented.
  No new automated tests this iteration (user decision).
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
- (2026-10-22) The same flow for Jenkins, plus a per-repo Jenkins
  connection. Every Jenkins sync problem shows what is wrong and where to
  fix it.

**Non-goals**

- Working CircleCI or Generic CLI targets. They render only as disabled
  stubs. (Jenkins is a working target since 2026-10-22.)
- A global Jenkins section in Settings. The Jenkins connection is per
  repository.
- Switching an existing repo from one CI target to the other.
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

### Jenkins target (2026-10-22)

All automated categories below are deferred this iteration (user
decision).

#### Wizard

- AC-35: WHEN the Target step renders, the system shall show Jenkins as a
  selectable card next to GitHub Actions. CircleCI and Generic CLI stay
  disabled "Coming soon" cards (AC-11). Choosing a target sets the
  `target` of every later preview, export and zip request. (verify via:
  manual check)
- AC-36: IF the server responds 409 `ci_target_conflict` (S-AC-47), THEN
  the system shall show a message naming the repo's existing target and
  keep Continue disabled until the repo or target changes. (verify via:
  manual check)
- AC-37: WHEN the Preview step renders for Jenkins, the system shall list
  the S-AC-52 files and show the `Jenkinsfile` in the editable text area
  instead of the workflow. AC-13, AC-14 and AC-16 apply.
  - IF the server responds 422 with Jenkinsfile lint violations
    (S-AC-61) or `jenkins_validator` errors (S-AC-62), THEN the system
    shall list each violation with its rule and line and stay on Preview.
  - WHEN the response carries the "validation skipped" warning, the
    system shall show it.

  (verify via: manual check with a deliberately insecure edit)
- AC-38: WHEN the Configure step renders for Jenkins, the system shall
  show only the trigger chips `opened` and `synchronize`, both selected by
  default. A caption shall state the S-AC-50 limits: a manual rebuild
  counts as an update, and reopened PRs are not a separate trigger in
  Jenkins. AC-18 (discarding a manual edit on trigger change) and AC-19
  (zero triggers keeps Continue disabled, with a hint) apply. (verify via:
  manual check)
- AC-39: WHEN the Configure step renders for Jenkins, the system shall
  show these fields, pre-filled with the S-AC-48 defaults:
  - job name;
  - OpenRouter credential ID;
  - GitHub token credential ID;
  - agent label.

  WHILE any field fails the S-AC-48 pattern, the system shall show an
  inline error on that field and keep Continue disabled. (verify via:
  manual check)
- AC-40: WHEN the Configure step renders for Jenkins, the system shall
  show a "Jenkins server" panel for the selected repo:
  - when connected: the URL and username, with an "Edit" action;
  - when not connected: "Not connected", a "Connect Jenkins" action, and
    a note that sync, job creation and Jenkinsfile validation need a
    connection.

  The actions open the Jenkins connection dialog (AC-47). A missing
  connection shall not block Continue. (verify via: manual check)
- AC-41: WHEN the Configure step renders for Jenkins, the secrets table
  shall list the configured OpenRouter and GitHub token credential IDs,
  each with kind "Secret text" and status "verify in Jenkins". It shall
  never display, request or read a secret value. The "Post results as"
  radios (AC-20) apply unchanged. (verify via: manual check, code
  inspection)
- AC-42: WHEN the Configure step renders for Jenkins, the merge-blocking
  info box shall state the agent's current Fail CI on value. It shall say
  that blocking a merge requires marking the Jenkins commit-status check
  as required in GitHub branch protection. (verify via: manual check)
- AC-43: WHEN the Install step renders for Jenkins, "Open a PR" (AC-23)
  shall name `Jenkinsfile` among the files. The step shall also offer an
  "Also create the Jenkins job `<job name>`" checkbox, with a scan
  credential ID field.
  - WHILE the repo has no Jenkins connection, the checkbox shall be
    disabled, with the reason and a "Connect Jenkins" action.
  - WHILE the checkbox is checked and the scan credential ID is empty or
    invalid, the Install action shall be disabled.

  (verify via: manual check)
- AC-44: WHEN a Jenkins export succeeds, the done state shall show the PR
  link and, if job creation was requested, its outcome:
  - "Job created", with a link to the job;
  - "Job already exists";
  - the failure message for the returned code (S-AC-69), stating that the
    PR was still opened.

  AC-27 applies. (verify via: manual check)

#### Per-repo Jenkins connection

- AC-45: WHEN the Jenkins connection dialog opens for a repo, the system
  shall show the repo name and fields for URL, username and API token.
  The token field is a password input with autocomplete off. It is never
  pre-filled; when a token is saved it shows a "saved, leave blank to
  keep" placeholder. Saving with a blank token keeps the stored token
  (S-AC-70). (verify via: manual check)
- AC-46: WHEN "Test connection" is clicked, the system shall call S-AC-72
  with the current field values. It shall show either the Jenkins version
  and user, or a specific message per error code. Test runs only on
  click, never on mount (client INSIGHTS 2026-10-16). (verify via: manual
  check)
- AC-47: WHEN the dialog is opened from any entry point, it shall edit
  the same per-repo connection. The entry points are:
  - the Configure step panel (AC-40);
  - the Install step (AC-43);
  - a "Jenkins connection" action on every Jenkins installation row of
    the CI tab;
  - the "Fix" action of a CI Runs sync error (AC-51).

  After a save or removal, the system shall refetch the connection and
  the agent-CI data. (verify via: manual check)
- AC-48: WHEN "Remove" is confirmed, the system shall call S-AC-73. The
  confirmation text shall state that installations are kept and that sync
  will report "not configured" until a connection is added again.
  (verify via: manual check)

#### CI tab and CI Runs page

- AC-49: WHEN the CI tab lists installations, each row shall show a
  target badge ("GitHub Actions" or "Jenkins"). A Jenkins row shall also
  show the job name. "Update CI config" (AC-4) shall pre-fill the target,
  the Jenkins fields and the triggers of that installation. (verify via:
  manual check)
- AC-50: WHILE an installation has a `last_sync_error` (S-AC-75), its CI
  tab row shall show the error message, a fix hint and the matching
  action (AC-52). (verify via: manual check)
- AC-51: WHEN a sync (Refresh or auto-refresh) returns `errors[]`, the CI
  Runs page shall show one entry per affected installation. Each entry
  names the repo and agent, says what is wrong for its code, gives a fix
  hint, and offers the action from AC-52. Rows from other installations
  still update. The entries stay until a later sync returns no error for
  that installation. (verify via: manual check)
- AC-52: The fix hint and action per sync error code shall be:
  - `jenkins_not_configured`: "This repo has no Jenkins connection";
    action "Connect Jenkins" opens the dialog for that repo.
  - `jenkins_connection_mismatch`: "Exported to <ci_server_url>, but the
    repo now points to another server"; actions "Edit connection" and
    "Re-export" (opens the wizard pre-filled, AC-4).
  - `jenkins_auth_failed`: "Jenkins rejected the username or API token";
    action "Edit connection".
  - `jenkins_unreachable`: "Jenkins at <url> did not respond"; action
    "Edit connection". The hint says to check that Jenkins is running.
  - `jenkins_job_not_found`: "Job <job name> does not exist on Jenkins";
    action "Re-export" with the "create the Jenkins job" option, or check
    the job name.

  After a fix, "Refresh" retries the sync without waiting for the
  throttle window (S-AC-70 clears it). (verify via: manual check)
- AC-53: WHEN the CI Runs page renders, the source filter shall include
  Jenkins, and the source column shall show the target label. A Jenkins
  row's job link opens its `job_url` with `rel="noopener noreferrer"`
  (AC-33). (verify via: manual check)

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
- (Jenkins) A long Jenkins URL, job folder path or credential ID wraps in
  the Configure panel, the dialog, the CI tab row and the error list
  instead of overflowing (client INSIGHTS 2026-09-24).
- (Jenkins) The repo is switched on the Target step after the Jenkins
  panel loaded: the panel and the Install checkbox reflect the new repo's
  connection.
- (Jenkins) The connection is removed while the wizard is open on
  Install: the job-creation checkbox becomes disabled after the refetch
  (AC-43).
- (Jenkins) Several installations share one repo and all fail with the
  same code: each one is listed (AC-51), and all of their "Fix" actions
  open the same repo dialog.

## Non-functional requirements

- **Security.** The UI never asks for, stores or shows secret values (AC-21).
  The job link opens with `noopener noreferrer` (AC-33).
- **Accessibility.** Disabled target cards expose `aria-disabled` and are
  skipped for selection by keyboard (AC-11). The stepper indicates the current
  step to assistive technology.
- **Jenkins (2026-10-22).**
  - The API token is write-only: the UI never displays it, never puts it
    in a query key or cache, and never logs it (AC-45).
  - The dialog's fields have labels, and Test results are announced
    (`aria-live`).
  - Each sync error entry is reachable and actionable by keyboard.
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
- [deterministic: user input] (Jenkins) target, edited `Jenkinsfile`,
  job name, credential IDs, agent label, scan credential ID, connection
  URL, username and API token.
- [deterministic: server] (Jenkins) per-repo connection
  (`url`, `username`, `has_token`), Test result, `jenkins_job` outcome,
  `last_sync_error`, sync `errors[]`.
- No LLM calls from the client: [new: 0 LLM calls].

## Untrusted inputs

- PR titles, repo names, `ingest_error` text and the edited workflow are
  rendered as plain text, never as HTML.
- `job_url` comes from GitHub's API through the server. It is opened only as
  an external link (AC-33).
- (Jenkins) The following are rendered as plain text, never as HTML:
  - Jenkins lint and validator messages;
  - Test-connection version and user strings;
  - sync error messages;
  - the Jenkins URL.

  Jenkins `job_url` values are built by the server (S-AC-78) and opened
  only as external links.

## Module interactions / API contracts

The client calls only the server routes defined in S-AC-1 – S-AC-45:

- `GET /agents/:id/ci`
- `POST /agents/:id/ci/preview|export|zip`
- `POST /ci-runs/sync`
- `GET /ci-runs`
- `GET /ci-runs/repos`

Fail CI on is saved through the existing agent update endpoint and hook
(`lib/hooks/agents.ts`). Trace links reuse the existing trace view.

Jenkins additions (2026-10-22):

- The extended `CiExportInput` / `CiExport` / `CiInstallation` /
  `CiSyncResult` contracts (S-AC-48, S-AC-69, S-AC-75).
- `GET|PUT|DELETE /ci/jenkins-connection` and
  `POST /ci/jenkins-connection/test` (S-AC-70 – S-AC-73).

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

- A8 (2026-10-22): The Jenkins connection UI is a reusable per-repo dialog
  opened in context (AC-47). It is not a Settings section and not a new
  repo page, because a CI installation's repo (`owner/name`) need not be
  an imported repo with a `/repos/[repoId]` page.

## Open questions

None. (Resolved 2026-10-22: triggers are changed only by re-exporting;
they never flag an installation "Out of date". No trigger editor on the CI
tab.)

Automated component and e2e tests for every AC-N above are deferred by
user decision.
