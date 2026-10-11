# Spec: Export to CI — workflow generation, export, verified ingest, CI Runs API

Spec ID: SPEC-03
Status: implemented
Supersedes: none

Client-side counterpart (CI tab, Export wizard, CI Runs page):
[`../../client/specs/agent-ci.md`](../../client/specs/agent-ci.md). Its
acceptance criteria are referenced here as `C-AC-N` and are not restated.
Approved plan: `C:\Users\User\.claude\plans\spicy-sauteeing-kurzweil.md`
(decisions D1–D12). Design reference: `docs/design/export-ci/*.png` (to be
saved by plan step 0b).

## Changelog

- 2026-10-10 — Security hardening + sync filtering, aligning the spec with
  the implemented, user-accepted behavior. AC-4: manifest skill entries must
  match `^[a-z0-9-]+$`. AC-17: each job has a bootstrap guard that skips the
  runner when `.devdigest/runner.mjs` is absent in the base checkout (run
  recorded as `artifact_missing`). AC-19: the lint rule set is extended
  (event allow-list, checkout ref/credentials, fork guard, untrusted
  expressions anywhere outside `env:` values, dangerous env names, strict
  `uses:` and image pinning, unknown keys, job-level `uses:`). AC-24:
  installations persist a stable `agent_slug`. AC-25: `pat_workflow_scope`
  is limited to workflow-file commits; other 403/404 get a distinct
  not-found/forbidden error. AC-32: sync skips `skipped`/`cancelled` runs and
  runs created before `installed_at`, retries on transient fetch errors, and
  treats a 404 run listing as zero runs. AC-35: extra artifact checks
  (findings total, run id/attempt, repository name) and a bounded artifact
  schema. AC-37: secret scan covers raw text, parsed keys/values and stored
  secret values. AC-40: status comes from the per-agent job conclusion.
  Assumptions A4 and A8 updated; A11 added (migration 0023).
- 2026-10-10 — Rewritten in place for the "Export to CI" redesign. The
  one-step "Publish to CI" flow (`POST /agents/:id/ci/publish`,
  `.devdigest/<slug>.json`, branch `devdigest/ci-<slug>`, a workflow calling
  the nonexistent `npx devdigest review`) is replaced by a GitHub-Actions-only
  export: a manifest/skills/memory/runner file set, a hardened workflow with
  server-side lint, a single `devdigest/ci` branch and PR per repo, multiple
  agents per repo, Fail CI on baked into the manifest with an "out of date"
  flag, and pull-based verified ingest of run artifacts into `agent_runs`,
  `run_traces` and `ci_runs`. All requirements now carry EARS AC-N ids
  (AC-1 – AC-45). Status moved from `implemented` back to `draft` because the
  new design is not built yet. No new automated tests are planned for this
  iteration (user decision), so automated verification is marked deferred.
- 2026-09-19 — initial version: Publish/re-publish idempotency, skills as
  resolved bodies, no runner yet.

## Problem and user

A DevDigest user who has tuned an agent (model, system prompt, skills, Fail CI
on) can only run it on their own machine. The existing "Publish to CI" flow
commits a workflow that calls a CLI that does not exist. That workflow is
insecure: actions are not SHA-pinned, there is no `permissions:` block, and
`${{ }}` expressions are interpolated into `run:`. Nothing brings CI results
back, so `/ci-runs` is always empty. The user wants to export the agent into a
target GitHub repo, have it review every pull request with the bundled
`agent-runner`, and see those runs in DevDigest.

## Goals / Non-goals

**Goals**

- Generate a GitHub Actions file set for one or more agents per repo: a
  manifest, skills, memory, the bundled runner, and a hardened workflow.
- Lint a user-edited workflow server-side and refuse insecure edits.
- Install by opening (or updating) one PR on branch `devdigest/ci`, or by
  returning a zip. Never commit to the default branch.
- Store Fail CI on on the agent, bake it into the manifest, and flag
  installations whose exported value no longer matches.
- Ingest CI results by pulling them from the GitHub API with the Settings PAT.
  Verify each artifact before persisting it, and store forged or expired ones
  as failed.
- Serve the CI Runs list with the columns and filters the client needs.

**Non-goals**

- CircleCI, Jenkins and Generic CLI generators. Only `gha` is accepted.
- A push/webhook ingest endpoint, or any extra secret or permission in the
  target repo.
- Changes to the multi-run service (`reviews/run-executor`), the PR feed, or
  `reviewer-core`.
- A memory store. `memory.jsonl` is generated empty.
- New automated tests (unit, integration, e2e) in this iteration. Existing
  suites must stay green; tests covering removed code are minimally adapted or
  deleted with it.

## User stories

None beyond the goals.

## Acceptance criteria (EARS)

Verification hints: this iteration adds no automated tests (user decision).
Each AC names the method used now (`code inspection`, `typecheck`, `manual
check`). Where an automated test would normally apply, the hint ends with
"automated: <category>, deferred".

### Preview and generated files

- AC-1: WHEN `POST /agents/:id/ci/preview` is called with a repo and target
  `gha`, the system shall return exactly these files:
  `.devdigest/agents/<slug>.yaml`, one `.devdigest/skills/<skill-slug>.md` per
  enabled linked skill, `.devdigest/memory.jsonl`, `.devdigest/runner.mjs` and
  `.github/workflows/devdigest-review.yml`. (verify via: manual check;
  automated: integration test, deferred)
- AC-2: WHEN the preview is returned, the system shall describe
  `.devdigest/runner.mjs` by metadata only (path, size in bytes, runner
  version, SHA-256 hash), without its body. (verify via: code inspection,
  manual check)
- AC-3: WHEN the preview is called, the system shall perform no GitHub write
  and no database write. (verify via: code inspection)
- AC-4: WHEN the manifest is generated, the system shall emit YAML that parses
  against the shared `AgentManifest` schema. The YAML shall contain
  `manifest_version`, `slug`, `name`, `provider`, `model`, `system_prompt`,
  the skill slugs, `strategy`, `ci_fail_on` and `post_as`. Every skill entry
  shall match `^[a-z0-9-]+$`. (verify via: code inspection, typecheck;
  automated: unit test, deferred)
- AC-5: WHEN `.devdigest/memory.jsonl` is generated, the system shall emit an
  empty file. (verify via: code inspection)
- AC-6: WHERE the agent's provider is not `openrouter`, the system shall write
  the model into the manifest under the OpenRouter namespace
  (`<provider>/<model>`, provider `openrouter`). The preview response shall
  include a warning naming the original and the mapped model. (verify via:
  manual check; automated: unit test, deferred)
- AC-7: The system shall never write the OpenRouter API key, the GitHub PAT or
  any other secret value into any generated file. (verify via: code inspection,
  manual check)

### Generated workflow

- AC-8: WHEN the workflow is generated, the system shall trigger it only on
  `pull_request` with `types` equal to the selected subset of `opened`,
  `synchronize` and `reopened`. (verify via: code inspection)
- AC-9: IF an export or preview request selects zero triggers, THEN the system
  shall respond 422 and generate nothing. (verify via: manual check)
- AC-10: WHEN the workflow is generated, the system shall declare a top-level
  `permissions:` block containing exactly `contents: read` and
  `pull-requests: write`. (verify via: code inspection)
- AC-11: WHEN the workflow is generated, the system shall pin every `uses:`
  reference to a full 40-character commit SHA. (verify via: code inspection)
- AC-12: WHEN the workflow is generated, the system shall check out
  `pull_request.base.sha` with `persist-credentials: false`. No step shall
  check out or execute code from the PR head. (verify via: code inspection)
- AC-13: WHEN the workflow is generated, the system shall give every job an
  `if:` condition that skips it when the PR head repository differs from the
  base repository (fork PRs). (verify via: code inspection, manual check)
- AC-14: The system shall never generate a workflow that uses the
  `pull_request_target` event. (verify via: code inspection)
- AC-15: WHEN the workflow is generated, the system shall pass every context
  value (PR number, SHAs, repository, run id) to steps only through `env:`. No
  `run:` value shall contain a `${{ ... }}` expression. (verify via: code
  inspection)
- AC-16: WHEN the workflow is generated, the system shall reference
  `OPENROUTER_API_KEY` only as `${{ secrets.OPENROUTER_API_KEY }}` inside a
  step `env:` block. (verify via: code inspection)
- AC-17: WHEN the workflow is generated for a repo, the system shall emit one
  job per agent installed in that repo, including the exporting agent. Each
  job shall set `DEVDIGEST_AGENT=<slug>` and upload its result as artifact
  `devdigest-result-<slug>` with `if: always()`. Each job shall also contain a
  bootstrap guard: WHEN `.devdigest/runner.mjs` is absent in the base checkout
  (`hashFiles('.devdigest/runner.mjs') == ''`), a notice step runs and the
  runner step is skipped, so the export PR's own run is not red. Such a run
  produces no artifact and is recorded as `artifact_missing` (AC-38).
  (verify via: code inspection, manual check)
- AC-18: WHEN the workflow is generated, the system shall include a
  `devdigest-workflow-version` header comment that carries the generator
  version. (verify via: code inspection)

### Workflow lint

- AC-19: WHEN a request carries a user-edited `workflow_yaml`, the system shall
  lint it. Each of the following is a blocking violation:
  - the YAML does not parse;
  - the `permissions:` block is missing, or grants anything beyond
    `contents: read` + `pull-requests: write`;
  - any `on` event other than `pull_request` (this includes
    `pull_request_target`);
  - an `actions/checkout` step whose `ref` is not exactly
    `${{ github.event.pull_request.base.sha }}`, or that lacks
    `persist-credentials: false`;
  - any job missing the fork-guard `if:` (AC-13);
  - an untrusted `${{ }}` expression (`github.event.*`, `github.head_ref`,
    `inputs.*`, `toJSON(github)`) anywhere in steps or `defaults.run`,
    except in `env:` values and the checkout `with.ref`;
  - a dangerous env name (`NODE_OPTIONS`, `LD_PRELOAD`, `LD_LIBRARY_PATH`,
    `BASH_ENV`, `ENV`, `PATH`) set from an expression;
  - a `uses:` value that does not match `owner/repo@<40-hex SHA>` (this
    rejects `./` local actions and `docker://` references);
  - a `container` or `services` image not pinned by an `@sha256:` digest;
  - an unknown or case-variant key at top, job or step level;
  - a job-level `uses:` (reusable workflow call).

  (verify via: manual check; automated: unit test, deferred)
- AC-20: IF the lint finds one or more blocking violations, THEN the system
  shall respond 422 listing every violation with its rule id and location, and
  shall perform no GitHub write and no database write. (verify via: manual
  check)

### Install (export and zip)

- AC-21: WHEN `POST /agents/:id/ci/export` succeeds with action `open_pr`, the
  system shall commit the file set to branch `devdigest/ci`, created from the
  repo's default branch as reported by GitHub. It shall never commit to the
  default branch. (verify via: manual check on a demo repo)
- AC-22: WHEN the export finds no open PR from `devdigest/ci`, the system shall
  open one titled "Add DevDigest CI review". The PR body shall contain a
  secrets checklist (`OPENROUTER_API_KEY`), the runner version and hash, and a
  CODEOWNERS / branch-protection recommendation for the workflow file.
  (verify via: manual check)
- AC-23: WHEN the export finds an open PR from `devdigest/ci`, the system shall
  commit to that branch and reuse the PR without opening a second one. This is
  the "Update CI config" path. (verify via: manual check; automated:
  integration test against `MockGitHubClient`, deferred)
- AC-24: WHEN an export succeeds, the system shall upsert one installation per
  (agent, repo). The installation stores the GitHub repo id, branch, workflow
  path and version, manifest version, exported `ci_fail_on`, `post_as`,
  triggers and PR URL. It shall also persist a stable `agent_slug`: the
  slugified agent name, suffixed with `-<first 6 chars of the agent id>` only
  if a different agent already holds that slug on the same repo. An existing
  installation keeps its stored slug on re-export. The manifest path, job,
  artifact name and sync verification shall use the stored slug. (verify via:
  code inspection, manual check)
- AC-25: IF GitHub responds 403 or 404 while committing files under
  `.github/workflows/`, THEN the system shall respond with error code
  `pat_workflow_scope` and a message stating that the PAT needs the
  `workflow` scope. IF GitHub responds 403 or 404 in any other export call
  (repo not found, no access), THEN the system shall respond with a distinct
  not-found/forbidden error, not `pat_workflow_scope`. (verify via: manual
  check)
- AC-26: WHEN `POST /agents/:id/ci/zip` is called, the system shall return a
  zip of the same file set an export would commit, including the runner body.
  It shall make no GitHub write and create no installation. (verify via: manual
  check)
- AC-27: WHEN `.devdigest/runner.mjs` is committed or zipped, the system shall
  use the bundled `agent-runner/bundle/runner.mjs` byte-for-byte. Its version
  and SHA-256 shall match what the preview reported. (verify via: code
  inspection)

### Fail CI on and "out of date"

- AC-28: WHEN an export runs, the system shall write the agent's stored
  `ci_fail_on` into the manifest and record that same value on the
  installation as `exported_ci_fail_on`. (verify via: code inspection)
- AC-29: WHILE an agent's current `ci_fail_on` differs from an installation's
  `exported_ci_fail_on`, the system shall report that installation with
  `out_of_date: true` from `GET /agents/:id/ci`. (verify via: manual check)
- AC-30: WHEN an out-of-date installation is re-exported, the system shall
  report it with `out_of_date: false`. (verify via: manual check)

### Agent CI endpoint

- AC-31: WHEN `GET /agents/:id/ci` is called, the system shall return the
  agent's installations and its 10 most recent CI runs, newest first. Each
  installation carries repo, workflow version, PR URL, last run status and
  time, and `out_of_date`. (verify via: manual check)

### Sync (pull-based ingest)

- AC-32: WHEN `POST /ci-runs/sync` is called, the system shall use the Settings
  PAT to list each installation's runs of `devdigest-review.yml` through the
  GitHub API. It shall ingest every completed run attempt that is not yet
  stored, except runs whose conclusion is `skipped` or `cancelled` and runs
  created before the installation's `installed_at`. IF fetching a run's
  artifacts or jobs fails with a network or transient error, THEN the system
  shall leave that run unstored so a later sync retries it. IF listing
  workflow runs returns 404 (workflow not merged yet), THEN the system shall
  treat it as zero runs, not as an error. (verify via: manual check on a demo
  repo)
- AC-33: IF `POST /ci-runs/sync` is called within 30 seconds of the previous
  sync, THEN the system shall return the previous result without calling
  GitHub. (verify via: code inspection)
- AC-34: WHILE a workflow run is not yet completed, the system shall skip it
  and consider it again on a later sync. (verify via: code inspection)
- AC-35: WHEN an artifact is ingested, the system shall accept it only if all
  of the following hold:
  - it parses against the strict, bounded `CiResultArtifact` schema: numbers
    are non-negative with maxima (cost ≤ 1000, counts ≤ 10000, duration ≤
    24 h), strings are at most 200 characters, and `dependencies` is strict;
  - its `findings_count` equals `critical + warning + suggestion`;
  - its `commit_sha` equals the run's GitHub-reported `head_sha`;
  - its `run_id` and `run_attempt` equal the API run's id and attempt;
  - its `repository_id` equals the installation's GitHub repo id and the run's
    `repository.id`;
  - its `repository` equals the installation repo (case-insensitive);
  - its PR number is in the run's `pull_requests[]`;
  - the run's workflow path is `.github/workflows/devdigest-review.yml`;
  - its agent slug matches the installation's stored `agent_slug` (AC-24).

  (verify via: code inspection; automated: unit test, deferred)
- AC-36: IF artifact verification fails, THEN the system shall store a
  `ci_runs` row with status `failed` and an `ingest_error` naming the failed
  check. It shall write no `agent_runs` or `run_traces` row. (verify via: code
  inspection, manual check)
- AC-37: IF the artifact contains a known secret pattern (OpenRouter
  `sk-or-`, GitHub `ghp_` / `gho_` / `ghs_` / `github_pat_`) or any of the
  server's stored secret values, THEN the system shall store the run as
  `failed` with `ingest_error: secret_detected`. The scan shall run on the
  raw artifact text and on every parsed string value and key. It shall
  persist none of the artifact's content. (verify via: code inspection)
- AC-38: IF the artifact is missing or past its retention period, THEN the
  system shall store the run as `failed` with `ingest_error` set to
  `artifact_missing` or `artifact_expired`. (verify via: manual check)
- AC-39: IF the downloaded artifact exceeds 10 MB, THEN the system shall stop
  reading it and store the run as `failed` with
  `ingest_error: artifact_too_large`. (verify via: code inspection)
- AC-40: WHEN a verified artifact is ingested, the system shall insert in ONE
  transaction:
  - an `agent_runs` row with `source='ci'` and `pr_id` NULL;
  - a `run_traces` row recording manifest version, model, dependencies,
    commit SHA and repo, with no secret values;
  - a `ci_runs` row linked to that agent run. This row holds repo, PR number
    and title, commit SHA, verdict, severity counts, duration, cost, model,
    GitHub run id, run attempt, and `job_url` from the API's `html_url`.

  The `ci_runs` and `agent_runs` status shall come from the conclusion of
  that agent's own job (GitHub jobs API, matched by job name). WHERE the job
  conclusion is unavailable, the system shall fall back to the run
  conclusion. (verify via: code inspection)
- AC-41: IF any insert in the ingest transaction fails, THEN the system shall
  persist none of the three rows for that run. (verify via: code inspection)
- AC-42: WHEN a run attempt that is already stored is seen again, the system
  shall not create another row. A new attempt of the same run shall create its
  own row. Uniqueness is (installation, GitHub run id, run attempt). (verify
  via: code inspection, manual check)
- AC-43: WHEN a sync finishes, the system shall update each installation's
  `last_synced_at` and return counts of runs ingested, failed and skipped.
  (verify via: manual check)

### CI Runs list

- AC-44: WHEN `GET /ci-runs` is called, the system shall return rows newest
  first. Each row carries timestamp, repo, PR number and title, agent, source,
  duration, per-severity finding counts, cost, verdict, status,
  `ingest_error`, the linked agent run id (for Trace) and `job_url`. The
  endpoint shall accept the filters period, agent, repo, status and source,
  combined with AND. (verify via: manual check)
- AC-45: WHEN `GET /ci-runs/repos` is called, the system shall return the
  distinct repos that have at least one installation. The old
  `POST /agents/:id/ci/publish` route and the old preview route shall no
  longer exist. (verify via: code inspection, typecheck)

## Edge cases

- The agent has no enabled skills: no `.devdigest/skills/*` files. The
  manifest's `skills` list is empty (AC-1, AC-4).
- A second agent is exported to a repo that already has one: the workflow is
  regenerated with both jobs, and the same `devdigest/ci` PR is reused
  (AC-17, AC-23).
- A user-edited workflow is replaced on the next export: re-export generates a
  fresh workflow unless the user edits it again in Preview (see Assumptions).
- Same-repo PRs can modify `devdigest-review.yml` itself. This is mitigated
  only by the CODEOWNERS / branch-protection recommendation in the PR body
  (AC-22).
- A fork PR's job is skipped, so it produces no artifact and no `ci_runs` row
  (AC-13).
- The export PR's own run happens before `.devdigest/runner.mjs` exists on
  the base branch: the bootstrap guard skips the runner, the check stays
  green, and the run is recorded as `artifact_missing` (AC-17, AC-38).
- Skipped or cancelled runs, and runs created before the installation, are
  never stored (AC-32).
- Re-running a failed job creates a new attempt and a new row (AC-42).
- A forged artifact from a same-repo PR that edited the workflow can fake
  findings but still has to match GitHub-reported sha, repo id, PR and path
  (AC-35). The ingest trusts GitHub's run metadata, never the artifact's own
  claims.
- CI runs appear in agent Stats because agent-performance has no source
  filter. This was accepted. They never appear in PR feed cost sums
  (`pr_id` NULL).

## Non-functional requirements

- **Security.** The GitHub PAT is read only through `SecretsProvider` and is
  never logged or returned. The generated workflow follows AC-10 – AC-16. No
  secret value reaches a manifest, an artifact row, a trace or a log (AC-7,
  AC-37, AC-40).
- **Required PAT scopes (documented in the error and PR body).** Classic:
  `repo` + `workflow`. Fine-grained: Contents, Pull requests and Workflows
  write, plus Actions read for sync.
- **Architecture.** The `ci` module follows the onion layout: pure helpers, a
  ports-only service, a Drizzle-only repository and thin routes. The service
  does not import Drizzle.
- **GitHub rate limits.** Sync is throttled (AC-33) and fetches only runs that
  are not yet stored.

## Inputs and provenance

- [deterministic: agent row + enabled linked skills] manifest and skill files.
- [deterministic: generator] workflow YAML, workflow version, memory.jsonl
  (empty).
- [reused: committed `agent-runner/bundle/runner.mjs`] runner body, version
  and hash.
- [deterministic: user input] repo, triggers, `post_as`, edited
  `workflow_yaml`.
- [reused: CI artifact produced by the runner in the target repo] findings,
  counts, verdict, cost, model, duration. The LLM call happens inside the
  target repo's CI, not in this server.
- [deterministic: GitHub API] `head_sha`, `repository.id`, `pull_requests[]`,
  workflow path, `html_url`, run id and attempt, default branch.
- No new LLM calls in this server: [new: 0 LLM calls].

## Untrusted inputs

- **User-edited `workflow_yaml`.** It is parsed as data and linted (AC-19). It
  is never evaluated, and it is committed only if the lint passes.
- **The downloaded artifact zip and its JSON.** Any same-repo PR author can
  influence it. It is size-capped, schema-validated, cross-checked against
  GitHub metadata and scanned for secrets (AC-35 – AC-39) before any field is
  persisted.
- **PR titles and other GitHub strings.** They are stored as plain text and
  never interpolated into generated YAML `run:` values (AC-15).

## Module interactions / API contracts

- `GitHubClient` port (`vendor/shared/adapters.ts`) gains `getRepo`,
  `listWorkflowRuns`, `listRunArtifacts`, `listRunJobs` (per-job conclusion,
  AC-40) and `downloadArtifact`. It keeps
  `commitFiles`, `findOpenPr` and `openPullRequest`. `MockGitHubClient` mirrors
  them.
- Shared contracts (`vendor/shared/contracts/eval-ci.ts`, identical in both
  trees):
  - `AgentManifest` adds `manifest_version`, `slug` and `post_as`; each
    `skills` entry must match `^[a-z0-9-]+$`.
  - `CiResultArtifact` becomes strict and adds `schema_version`, `repository`,
    `repository_id`, `commit_sha`, `run_id`, `run_attempt`, `verdict`,
    `blockers`, `gate_triggered`, `model`, `manifest_version` and
    `dependencies`.
  - `CiExportInput.triggers` becomes an enum array, and the input gains
    `workflow_yaml`.
  - `CiInstallation`, `CiRun` and `RunTrace.config` gain nullish fields.
- Routes:
  - `GET /agents/:id/ci`
  - `POST /agents/:id/ci/preview`
  - `POST /agents/:id/ci/export`
  - `POST /agents/:id/ci/zip`
  - `POST /ci-runs/sync`
  - `GET /ci-runs`
  - `GET /ci-runs/repos`
- Runner contract (agent-runner): the runner reads the manifest selected by
  `DEVDIGEST_AGENT`. It takes `post_as` from the manifest, loads
  `memory.jsonl` if it is non-empty, and writes the extended
  `CiResultArtifact`.
- The client consumes all of the above (see `C-AC-*`).

## Assumptions

Conservative choices made where the approved plan is silent. Each one is
listed in the handoff.

- A1: With one job per agent, artifact names must be unique within a run, so
  each job uploads `devdigest-result-<slug>` (AC-17). One workflow run can
  produce one `ci_runs` row per agent.
- A2: The sync throttle window is 30 seconds (AC-33).
- A3: The artifact size cap is 10 MB (AC-39).
- A4: The secret scan matches known token prefixes and the server's stored
  secret values (AC-37). It does not do entropy-based detection.
- A5: A zip download creates no installation (AC-26). Runs from a manually
  installed zip are therefore not synced.
- A6: Only a `ci_fail_on` change marks an installation out of date (AC-29), as
  the plan states. Prompt, model or skill changes do not flag it in this
  iteration.
- A7: Re-export regenerates the workflow and does not preserve earlier manual
  edits.
- A8: A missing workflow scope maps to error code `pat_workflow_scope`
  (AC-25), but only for a 403/404 on a commit under `.github/workflows/`.
  Other 403/404 responses map to a distinct not-found/forbidden error.
- A9: `GET /agents/:id/ci` returns the 10 most recent runs (AC-31).
- A10: Status was moved back to `draft` because the new design is
  unimplemented.
- A11: Migration 0023 adds `ci_installations.agent_slug` (AC-24).

## Open questions

None blocking. Automated tests for the AC-N above are deferred to a later
iteration by user decision.
