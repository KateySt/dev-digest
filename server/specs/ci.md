# Spec: Export to CI — workflow generation, export, verified ingest, CI Runs API

Spec ID: SPEC-03
Status: draft
Supersedes: none

Client-side counterpart (CI tab, Export wizard, CI Runs page):
[`../../client/specs/agent-ci.md`](../../client/specs/agent-ci.md). Its
acceptance criteria are referenced here as `C-AC-N` and are not restated.
Approved plan: `C:\Users\User\.claude\plans\spicy-sauteeing-kurzweil.md`
(decisions D1–D12). Design reference: `docs/design/export-ci/*.png` (to be
saved by plan step 0b).

## Changelog

- 2026-10-22 — Jenkins becomes a second working target (AC-46 – AC-86).
  The Jenkins target is a `Jenkinsfile` in the same `devdigest/ci` PR,
  consumed by a Jenkins Multibranch Pipeline with GitHub Branch Source.
  Repos stay on GitHub, and reviews are still posted to the GitHub PR.
  - Generation, lint and an optional Jenkins validator. One CI target per
    repo (409 `ci_target_conflict`).
  - A Jenkins trigger set of `opened` + `synchronize`, classified by build
    number, with stated limits. `reopened` is not supported.
  - A per-repo Jenkins connection (URL, username, API token kept in the
    secrets adapter only), Test and Remove.
  - Optional multibranch job creation over Jenkins REST (`config.xml`,
    never an inline script).
  - Pull-based verified Jenkins ingest with per-installation sync errors
    and a new build identity (`external_build_id`).
  - Runner Jenkins context, per-agent result files, and secret-scan
    coverage of Jenkins tokens.

  AC-1 – AC-45 are now scoped to target `gha` where they name
  GitHub-Actions-only artifacts (see "Jenkins target" for the mapping).
  The non-goal "Jenkins generator" is removed. Status moved from
  `implemented` to `draft`: the GitHub Actions part stays implemented, the
  Jenkins part is unbuilt. No new automated tests this iteration (user
  decision); verification hints mark automated categories as deferred.
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
- (2026-10-22) Offer Jenkins as a second target with the same guarantees:
  - a hardened, linted `Jenkinsfile` in the same `devdigest/ci` PR;
  - a per-repo Jenkins connection;
  - optional creation of the multibranch job;
  - verified pull-based ingest of Jenkins builds into the same tables.

**Non-goals**

- CircleCI and Generic CLI generators. Only `gha` and `jenkins` are
  accepted (2026-10-22).
- Jenkins: non-GitHub repo hosting, push/webhook ingest from Jenkins, an
  inline pipeline script in job config, switching an existing repo's CI
  target, and silent automatic re-export when an agent changes (the
  existing "out of date" flag + one-click re-export is reused).
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

### Jenkins target (2026-10-22)

Scope of AC-1 – AC-45 for Jenkins:

- **Apply to `jenkins` unchanged:** AC-2 – AC-7, AC-9, AC-20, AC-24,
  AC-26 – AC-31, AC-33, AC-36 – AC-41, AC-43 – AC-45.
- **Replaced for `jenkins`** (they stay authoritative for `gha`): AC-1,
  AC-8, AC-10 – AC-19, AC-32, AC-34, AC-35, AC-40 (status source) and
  AC-42.
- **Apply with the Jenkins additions below:** AC-21 – AC-23 and AC-25.

All automated categories below are deferred this iteration (user
decision).

#### Target selection and inputs

- AC-46: WHEN `POST /agents/:id/ci/preview|export|zip` is called with
  target `jenkins`, the system shall accept it. Targets `circle` and `cli`
  shall still be rejected with 422. (verify via: manual check; automated:
  integration test, deferred)
- AC-47: IF a preview or export targets a repo that already has an
  installation (of any agent) with a different `target_type`, THEN the
  system shall respond 409 `ci_target_conflict` naming the existing target.
  It shall perform no GitHub, Jenkins or database write. (verify via:
  manual check)
- AC-48: WHERE the target is `jenkins`, the system shall require a
  `jenkins` input object with these fields:
  - `job_name`: default `devdigest-review`, folders allowed, matches
    `^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$`;
  - `openrouter_credential_id`: default `devdigest-openrouter-api-key`;
  - `github_credential_id`: default `devdigest-github-token`;
  - `agent_label`: default `any`, matches `^[A-Za-z0-9._ &|!()-]{1,100}$`;
  - `scan_credential_id`: optional, used only for job creation.

  Credential IDs shall match `^[A-Za-z0-9._-]{1,100}$`. IF any field is
  invalid, or `workflow_yaml` is sent with target `jenkins`, THEN the
  system shall respond 422. (verify via: manual check; automated: unit
  test, deferred)

#### Triggers

- AC-49: WHERE the target is `jenkins`, the system shall accept only the
  triggers `opened` and `synchronize`. IF `reopened` is selected, THEN the
  system shall respond 422 `trigger_not_supported`. IF zero triggers are
  selected, THEN the system shall respond 422 as in AC-9. (verify via:
  manual check)
- AC-50: WHEN a Jenkins build of a `PR-<n>` job runs, its trigger class
  shall be:
  - `opened` IF its build number is 1;
  - `synchronize` otherwise.

  The generated `Jenkinsfile` shall run an agent's stage only WHEN the
  build's class is in that agent's installation triggers. Each agent's
  stage carries its own installation's triggers, so exporting one agent
  never changes another agent's triggers. Documented limitations, which
  shall also be stated in the PR body:
  - a manual rebuild or replay counts as `synchronize`;
  - a reopened PR is classified `opened` only if Jenkins had removed its
    job; Jenkins does not rebuild a reopen without new commits.

  (verify via: code inspection, manual check; automated: unit test,
  deferred)
- AC-51: WHEN sync sees a completed Jenkins build whose trigger class
  (AC-50) is not in the installation's triggers, the system shall skip it
  and store no row. (verify via: code inspection)

#### Generated Jenkinsfile

- AC-52: WHEN the target is `jenkins`, the system shall return the AC-1
  file set, except that a root `Jenkinsfile` replaces
  `.github/workflows/devdigest-review.yml`. No file under
  `.github/workflows/` shall be generated. (verify via: manual check)
- AC-53: WHEN the `Jenkinsfile` is generated, it shall be a declarative
  pipeline with:
  - a `devdigest-jenkinsfile-version` header comment carrying the
    generator version;
  - a 15-minute timeout;
  - concurrent builds disabled, with the previous build aborted;
  - a build discarder.

  (verify via: code inspection)
- AC-54: WHEN the `Jenkinsfile` is generated, every agent stage shall be
  skipped WHEN the build is not a change request (`CHANGE_ID` unset) or
  `CHANGE_FORK` is set. (verify via: code inspection)
- AC-55: WHEN the `Jenkinsfile` is generated, the first step before any
  agent stage shall replace `.devdigest/` in the workspace with the
  version from `origin/$CHANGE_TARGET`. The fetch shall be authenticated
  through the GitHub token credential, so it works for private repos.
  `CHANGE_TARGET` shall appear only as a quoted shell variable inside a
  single-quoted Groovy string. No step shall execute `.devdigest/` content
  from the PR head. (verify via: code inspection, manual check)
- AC-56: WHEN the `Jenkinsfile` is generated, each agent stage shall
  contain a bootstrap guard. WHEN `.devdigest/runner.mjs` or that agent's
  manifest is absent after the restore, the stage shall print a notice and
  skip the runner without failing. Such a build produces no result file
  and is recorded as `artifact_missing` (AC-38). (verify via: code
  inspection, manual check)
- AC-57: WHEN the `Jenkinsfile` is generated, the OpenRouter key and the
  GitHub token shall be bound only through `withCredentials` using the
  configured credential IDs. They shall be referenced inside `sh` only as
  shell environment variables in single-quoted strings. No credential or
  environment value shall be Groovy-interpolated into a `sh` string.
  (verify via: code inspection)
- AC-58: WHEN the `Jenkinsfile` is generated, each agent stage shall:
  - set `DEVDIGEST_AGENT=<slug>` and `DEVDIGEST_REPOSITORY=<owner/name>`;
  - run `node .devdigest/runner.mjs`, writing
    `devdigest-result-<slug>.json`;
  - run in sequence with the other agent stages, wrapped so that a runner
    failure or a triggered gate marks that stage and the build `FAILURE`
    while later stages still run.

  An `always` post step shall archive `devdigest-result-*.json` with empty
  archives allowed. (verify via: code inspection, manual check)
- AC-59: WHEN the `Jenkinsfile` is generated, it shall run on the
  configured agent label. Before the first agent stage it shall check that
  `node` is on PATH at major version 20 or higher. IF that check fails,
  THEN it shall fail with a message naming the requirement. (verify via:
  code inspection, manual check)

#### Jenkinsfile lint and validator

- AC-60: WHEN a request carries a user-edited `jenkinsfile`, the system
  shall lint it as text, never evaluating it. Each of the following is a
  blocking violation:
  - a missing non-change-request / fork skip (AC-54);
  - a missing base restore of `.devdigest/` before the first agent stage
    (AC-55);
  - a missing `withCredentials` binding for either secret, or a credential
    referenced outside it (AC-57);
  - Groovy `${…}` interpolation inside a double-quoted or
    triple-double-quoted `sh`, `bat` or `powershell` string;
  - any `script {` block, `load`, `evaluate`, `@Grab`, `@Library` or
    `library` step, or a scripted `node(` block;
  - a dangerous env name (`NODE_OPTIONS`, `LD_PRELOAD`,
    `LD_LIBRARY_PATH`, `BASH_ENV`, `ENV`, `PATH`) set in `environment` or
    `withEnv`;
  - a missing archive of `devdigest-result-*.json`;
  - a missing timeout;
  - an agent stage whose trigger guard does not match that installation's
    triggers (AC-50).

  (verify via: manual check with a deliberately insecure edit; automated:
  unit test, deferred)
- AC-61: IF the Jenkinsfile lint finds one or more violations, THEN the
  system shall respond 422 listing every violation with its rule id and
  line. It shall perform no GitHub, Jenkins or database write. (verify
  via: manual check)
- AC-62: WHERE the target repo has a Jenkins connection and an edited
  `jenkinsfile` passed AC-60, the system shall submit it to that Jenkins'
  declarative validator.
  - IF the validator reports errors, THEN the system shall respond 422
    with rule `jenkins_validator` and the reported messages.
  - IF the repo has no connection, or Jenkins is unreachable, THEN the
    system shall proceed and add a response warning that validation was
    skipped.

  (verify via: manual check)

#### Install

- AC-63: WHEN a Jenkins export succeeds with action `open_pr`, the system
  shall commit to and open or reuse the `devdigest/ci` PR exactly as in
  AC-21 – AC-23. The PR body shall contain:
  - a Jenkins setup checklist: each credential ID to create (secret text)
    and its purpose; Node 20+ on the agent label; required plugins
    (Pipeline, Pipeline: Multibranch, GitHub Branch Source, Credentials
    Binding, Git); and the job settings (same-repo PRs only, "current pull
    request revision", no branch or fork discovery);
  - the AC-50 trigger limitations;
  - the runner version and hash;
  - a CODEOWNERS / branch-protection recommendation covering both
    `.devdigest/` and `Jenkinsfile`;
  - a note that GitHub Branch Source "Trust" only governs fork PRs and
    does not protect against same-repo PRs editing the `Jenkinsfile`.

  The PR body shall not ask for any GitHub repository secret. (verify via:
  manual check)
- AC-64: WHEN a Jenkins export succeeds, the installation (AC-24) shall
  record:
  - `target_type='jenkins'`;
  - `workflow_path='Jenkinsfile'` and the Jenkinsfile generator version;
  - `ci_job_name`, the credential IDs, the agent label and the triggers;
  - `ci_server_url`: the origin of the repo's Jenkins connection at export
    time, or null when the repo has none.

  (verify via: code inspection)
- AC-65: WHERE the target is `jenkins`, the system shall never map an
  export error to `pat_workflow_scope`, because no file under
  `.github/workflows/` is committed. A GitHub 403/404 shall map to the
  not-found/forbidden errors of AC-25. (verify via: code inspection)
- AC-66: WHEN `POST /agents/:id/ci/zip` is called with target `jenkins`,
  the zip shall contain the AC-52 file set. AC-26 and AC-27 apply.
  (verify via: manual check)

#### Optional Jenkins job creation

- AC-67: WHEN an export with `create_jenkins_job: true` has committed and
  opened (or reused) the PR, the system shall create the multibranch job
  `ci_job_name` on the repo's Jenkins connection. It shall use the
  Jenkins REST `createItem` call with a generated `config.xml` containing:
  - a GitHub Branch Source for the repo, using `scan_credential_id`;
  - same-repo PR discovery only, with the "current pull request
    revision" strategy;
  - no branch discovery and no fork discovery;
  - script path `Jenkinsfile`;
  - a periodic scan every 1 hour.

  The pipeline script shall never be stored inline in the job config.
  (verify via: manual check against a Dockerized Jenkins)
- AC-68: IF `create_jenkins_job: true` is requested and the repo has no
  Jenkins connection, or `scan_credential_id` is missing, THEN the system
  shall respond 422 `jenkins_not_configured` before any GitHub write.
  (verify via: manual check)
- AC-69: IF the job already exists, THEN the system shall leave it
  untouched. It shall report `jenkins_job.status='already_exists'` when
  the item is a multibranch project, and `failed` with code
  `jenkins_job_conflict` otherwise. IF job creation fails for any other
  reason, THEN the export shall still succeed, with
  `jenkins_job.status='failed'` and an error code (`jenkins_auth_failed`,
  `jenkins_unreachable`, `jenkins_plugin_missing` or
  `jenkins_create_failed`). (verify via: manual check)

#### Per-repo Jenkins connection

- AC-70: WHEN `PUT /ci/jenkins-connection` is called with `repo`
  (`owner/name`), `url`, `username` and `api_token`, the system shall save
  that repo's connection.
  - The URL shall be http(s), carry no userinfo, query or fragment, and
    is stored as its origin plus path.
  - The API token shall be stored only through `SecretsProvider`, keyed
    per repo, never in the database.
  - An update that omits `api_token` keeps the stored token.
  - Saving or removing a connection shall clear the sync throttle cache
    (AC-33) for the workspace.

  (verify via: manual check)
- AC-71: WHEN `GET /ci/jenkins-connection?repo=` is called, the system
  shall return `url`, `username` and `has_token`, or null when the repo
  has none. It shall never return the token. (verify via: code
  inspection, manual check)
- AC-72: WHEN `POST /ci/jenkins-connection/test` is called with a repo and
  optional unsaved fields, the system shall call Jenkins'
  authenticated-identity endpoint. Unsaved fields override saved ones,
  and the stored token is used when none is supplied. It shall return
  either `ok` with the Jenkins version and user, or an error code:
  `jenkins_auth_failed`, `jenkins_unreachable`, `jenkins_not_jenkins` or
  `jenkins_not_configured`. It shall write nothing. (verify via: manual
  check)
- AC-73: WHEN `DELETE /ci/jenkins-connection?repo=` is called, the system
  shall remove that repo's connection and its stored token. It shall keep
  every installation and `ci_runs` row. (verify via: manual check)

#### Sync and verified ingest (Jenkins)

- AC-74: WHEN `POST /ci-runs/sync` is called, the system shall use the
  repo's Jenkins connection to list builds of each Jenkins installation's
  `PR-<n>` branch jobs under `ci_job_name`. It shall ingest every
  completed build not yet stored. It shall skip without storing:
  - builds still running (reconsidered on a later sync);
  - builds with result `ABORTED` or `NOT_BUILT`;
  - builds that started before `installed_at`;
  - builds excluded by AC-51.

  IF a Jenkins call fails with a network or transient error, THEN the
  build stays unstored for a later retry. GitHub Actions installations
  sync as before. (verify via: manual check against a Dockerized Jenkins;
  automated: unit test with faked Jenkins HTTP, deferred)
- AC-75: IF a Jenkins installation cannot be synced, THEN the system shall
  skip it, still sync every other installation, and add an entry to a new
  `CiSyncResult.errors[]`. Each entry carries `installation_id`, `repo`,
  `agent_id`, `code` and a human-readable `message`. Codes:
  - `jenkins_not_configured`: the repo has no connection;
  - `jenkins_connection_mismatch`: the installation's `ci_server_url`
    origin differs from the repo's current connection origin;
  - `jenkins_auth_failed`: 401/403;
  - `jenkins_unreachable`: network error, timeout or 5xx;
  - `jenkins_job_not_found`: 404 on `ci_job_name`.

  The same code shall be persisted on the installation as
  `last_sync_error` and returned by `GET /agents/:id/ci`. It shall be
  cleared by that installation's next successful sync. No credential
  shall be sent when the code is `jenkins_connection_mismatch`. (verify
  via: manual check)
- AC-76: WHEN a Jenkins build is ingested, the system shall fetch the
  archived file `devdigest-result-<slug>.json` directly.
  - IF it is absent, THEN the run is stored as `failed` with
    `artifact_missing`. A file removed by the build discarder is
    indistinguishable from a missing one.
  - IF it exceeds 10 MB, THEN the system stops reading and stores
    `artifact_too_large`.

  AC-36, AC-37 and AC-41 apply unchanged. (verify via: code inspection)
- AC-77: WHEN a Jenkins artifact is verified, the system shall accept it
  only if all of the following hold:
  - it parses against the strict, bounded `CiResultArtifact` schema;
  - `findings_count` equals the severity sum;
  - `ci_target` is `jenkins`;
  - `ci_job` equals `<ci_job_name>/PR-<n>`, with `n` taken from the
    Jenkins branch job name;
  - `pr_number` equals `n`;
  - `run_id` equals the Jenkins build number and `run_attempt` equals 1;
  - `repository_id` equals the installation's GitHub repo id;
  - `repository` equals the installation repo (case-insensitive);
  - `commit_sha` is a commit of PR `n` according to the GitHub API
    (Settings PAT);
  - the agent slug equals the installation's `agent_slug`.

  The system shall trust Jenkins and GitHub metadata, never the
  artifact's own claims. (verify via: code inspection; automated: unit
  test, deferred)
- AC-78: WHEN a Jenkins build is stored, its identity shall be
  (installation, `external_build_id`), where `external_build_id` is
  `PR-<n>#<build number>@<build start epoch ms>`. A build already stored
  shall never create another row, and a job recreated with restarted
  build numbers shall not collide. Jenkins rows shall have
  `github_run_id` and `run_attempt` null and `source='jenkins'`.
  `job_url` shall be built from the connection base URL plus the job
  path, never taken from Jenkins JSON. (verify via: code inspection,
  manual check)
- AC-79: WHEN a verified Jenkins artifact is ingested, the system shall
  write the AC-40 rows in one transaction. The status shall come from the
  artifact, and a triggered gate is not a failure:
  - `agent_runs.status='done'`;
  - `ci_runs.status` is `succeeded` or `no_findings`.

  No per-stage Jenkins API is consulted. (verify via: code inspection)

#### Runner (agent-runner) under Jenkins

- AC-80: WHEN the runner starts with `JENKINS_URL` set, it shall build its
  context from:
  - `CHANGE_ID` as the PR number;
  - `DEVDIGEST_REPOSITORY` as the repo, falling back to a parsed
    `GIT_URL`;
  - `BUILD_NUMBER` as `run_id`, with `run_attempt` 1;
  - `<JOB_NAME>` as `ci_job`.

  IF any of them is missing or malformed, THEN it shall hard-fail: exit
  non-zero, post nothing, write no result file. (verify via: manual
  check; automated: unit test, deferred)
- AC-81: WHEN running under Jenkins, the runner shall fetch the PR's
  title, body, head SHA, base repository id and head repository from the
  GitHub API using `GITHUB_TOKEN`. IF `CHANGE_FORK` is set or the head
  repository differs from the base repository, THEN it shall hard-fail
  without reviewing, posting or writing a result file. (verify via:
  manual check; automated: unit test, deferred)
- AC-82: WHEN running under Jenkins, the runner shall write
  `devdigest-result-<slug>.json` with `ci_target='jenkins'` and `ci_job`
  set. `commit_sha` shall be the head SHA it reviewed. Review posting,
  the gate and the exit code shall be unchanged from GitHub Actions.
  (verify via: manual check)
- AC-83: WHEN the shared `CiResultArtifact` contract gains `ci_target`
  (`gha` | `jenkins`, default `gha`) and `ci_job` (nullable, at most 200
  characters), the system shall keep accepting existing GitHub Actions
  artifacts that lack both. The committed runner bundle shall be rebuilt
  with `pnpm build`. (verify via: typecheck, code inspection)

#### Security and regressions

- AC-84: WHEN any Jenkins HTTP call is made, the system shall:
  - apply a 10-second timeout;
  - send credentials only to the connection's origin;
  - never follow a redirect to another origin;
  - never follow absolute URLs returned in Jenkins responses (every URL
    is built from the saved base URL);
  - never log or return the Jenkins API token.

  (verify via: code inspection)
- AC-85: WHEN files are generated (AC-7) or artifacts are scanned (AC-37),
  the system shall include every stored Jenkins API token in the
  stored-secret checks. (verify via: code inspection)
- AC-86: WHILE the target is `gha`, the system shall behave exactly as in
  AC-1 – AC-45. The only additive response fields are
  `CiSyncResult.errors[]` and `last_sync_error`. (verify via: manual
  regression check on a demo repo)

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
- (Jenkins) A same-repo PR can edit the `Jenkinsfile` and drop the base
  restore, because multibranch always uses the PR branch's `Jenkinsfile`
  for same-repo PRs. This is the same exposure as GitHub Actions. It is
  mitigated only by CODEOWNERS / branch protection on `Jenkinsfile` and
  `.devdigest/` (AC-63). Any forged artifact must still pass AC-77.
- (Jenkins) Fork PRs: the generated job does not discover forks (AC-67).
  The `CHANGE_FORK` skip (AC-54) and the runner's own fork refusal (AC-81)
  cover jobs created by hand.
- (Jenkins) When a PR closes, multibranch removes its `PR-<n>` job.
  Builds not yet synced are lost and never appear in CI Runs. Accepted
  and documented.
- (Jenkins) The build discarder removes old archived files: such builds
  are stored as `artifact_missing` (AC-76).
- (Jenkins) A deleted and recreated job restarts build numbers. The start
  timestamp in `external_build_id` prevents false "already stored" skips
  (AC-78).
- (Jenkins) The export PR's own build has no runner on the base branch
  yet. The bootstrap guard keeps the build green, and the build is stored
  as `artifact_missing` (AC-56).
- (Jenkins) Exporting to a repo whose other agents use GitHub Actions (or
  the reverse) returns 409 `ci_target_conflict` (AC-47).
- (Jenkins) A repo's connection is removed or changed to another server.
  Installations stay, and sync reports `jenkins_not_configured` or
  `jenkins_connection_mismatch` per installation (AC-73, AC-75).
- (Jenkins) A manual rebuild counts as `synchronize`. A reopened PR is
  classified `opened` only if Jenkins had removed its job (AC-50).

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
- **Jenkins (2026-10-22).**
  - Per-repo API tokens live only in `SecretsProvider`.
  - Jenkins HTTP follows AC-84.
  - The connection URL may be `http://`, because local or LAN Jenkins is
    the primary case.
  - Jenkins sync calls are bounded by the same 30-second throttle and
    fetch only builds not yet stored.

  The Jenkins connection keeps the module's onion layering: a Jenkins
  port and adapter, with no `fetch` in the service.

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
- [deterministic: generator] `Jenkinsfile`, Jenkinsfile version, job
  `config.xml` (2026-10-22).
- [deterministic: user input] Jenkins job name, credential IDs, agent
  label, scan credential ID, edited `jenkinsfile`, per-repo connection
  (URL, username, API token).
- [deterministic: Jenkins REST API] branch job names (`PR-<n>`), build
  numbers, start timestamps, `building`/result, archived file bytes,
  validator result, identity/version for Test connection.
- [deterministic: GitHub API] whether `commit_sha` belongs to PR `n`
  (AC-77).
- [reused: CI artifact produced by the runner on Jenkins] same fields as
  the GitHub Actions artifact plus `ci_target` and `ci_job`.
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
- **User-edited `jenkinsfile`.** It is linted as text (AC-60) and
  optionally checked by Jenkins' validator (AC-62). It is never evaluated
  by the server.
- **Jenkins API responses.** Build metadata and archived files from the
  Jenkins API are untrusted. Absolute URLs in them are never followed
  (AC-84). The archived file goes through the same size, schema, secret
  and cross-check gates as a GitHub artifact (AC-76, AC-77).
- **Jenkins env values in the runner** (`CHANGE_TARGET`, `CHANGE_ID`,
  `GIT_URL`, `JOB_NAME`). They reach shell only as quoted variables
  (AC-55, AC-57), and the runner validates them (AC-80).
- **The Jenkins connection URL.** It is validated as http(s) with no
  userinfo, query or fragment (AC-70).

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
- Jenkins additions (2026-10-22):
  - `CiExportInput` gains:
    - `jenkins?: { job_name, openrouter_credential_id,
      github_credential_id, agent_label, scan_credential_id? }`, required
      when `target='jenkins'`;
    - `jenkinsfile?: string`;
    - `create_jenkins_job?: boolean`.
  - `CiExport` gains `jenkins_job?: { status: 'created' |
    'already_exists' | 'failed', url?, code? }`.
  - `CiInstallation` gains nullish `ci_server_url`, `ci_job_name`,
    credential IDs, `agent_label` and `last_sync_error`.
  - `CiSyncResult` gains `errors[]` (AC-75).
  - `CiRun.source` may be `jenkins`.
  - `CiResultArtifact` gains `ci_target` and `ci_job` (AC-83).
  - The `ci_runs` row gains `external_build_id`, nullable for GitHub
    Actions rows. A migration adds the new columns; the planner finalizes
    the names.
  - New routes: `GET|PUT|DELETE /ci/jenkins-connection` and
    `POST /ci/jenkins-connection/test` (AC-70 – AC-73).
  - Runner contract: Jenkins env (AC-80) plus `DEVDIGEST_REPOSITORY`,
    `DEVDIGEST_AGENT`, `GITHUB_TOKEN` and `OPENROUTER_API_KEY`, the last
    two bound by `withCredentials`.
  - Jenkins REST endpoints used: authenticated identity (Test),
    `createItem` (job creation), pipeline-model-converter `validate`, job
    and build JSON listing, and archived-file download.

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
- A12 (2026-10-22): The CI target is per repo (AC-47). Switching a repo
  from one target to the other is out of scope.
- A13: The Jenkins sequential stages, 15-minute timeout and 1-hour
  periodic scan are defaults. Webhooks cannot reach a localhost studio,
  and Jenkins' own GitHub webhook setup is left to the user.
- A14: A6 still holds: only a `ci_fail_on` change marks an installation
  out of date. Triggers are changed only by re-exporting from the wizard,
  so they never flag an installation out of date (user decision
  2026-10-22).

## Open questions

None. (Resolved 2026-10-22: triggers do not flag an installation out of
date; see A14.)

Automated tests for every AC-N above are deferred by user decision.
