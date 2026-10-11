# Development Plan: Export to CI (wizard, bundled runner, verified pull ingest, CI Runs)

## Execution mode
- **Multi-agent pipeline**, confirmed by the user: implementer, then an architecture-reviewer fix loop, then plan-verifier, then doc-writer. **No test-writer.**
- Steps are handed off to separate implementer invocations. Steps tagged `[P]` in the same batch own non-overlapping paths and may be fanned out at once. Steps tagged `[S]` wait for the steps they depend on (see the DAG below).

## Spec followed
- `server/specs/ci.md` (SPEC-03, AC-1..AC-45), referenced below as **S-AC-N**.
- `client/specs/agent-ci.md` (SPEC-03, AC-1..AC-34), referenced below as **C-AC-N**.
- Approved plan: `C:\Users\User\.claude\plans\spicy-sauteeing-kurzweil.md` (decisions D1–D12 plus "User answers").
- Spec assumptions in force:
  - Server: A1 artifact name `devdigest-result-<slug>`; A2 30 s sync throttle; A3 10 MB artifact cap; A4 secret scan by prefix only; A5 a zip creates no installation; A6 only `ci_fail_on` drives out-of-date; A7 re-export regenerates the workflow; A8 error code `pat_workflow_scope`; A9 10 recent runs.
  - Client: A1 repo field on the Target step; A2 lint on leaving Preview; A3 `any` value means no segment is selected and a caption shows it; A4 60 s auto-refresh; A5 period options 24 h / 7 d / 30 d; A6 `SeverityCountBadges` for Findings.

## Requirements review
- Every planner question (Q1–Q21) was answered by the user (see the approved plan's "User answers"). Changes from the earlier draft:
  - **Targets.** Only GitHub Actions is implemented. CircleCI, Jenkins and Generic CLI render as disabled "Coming soon" cards with no generators (C-AC-11). This overrides D2.
  - **Tests.** No new tests of any kind (unit, integration, client, e2e). Existing tests broken by removed or changed code are minimally adapted, or deleted along with that code, and never extended. The e2e step is dropped.
  - **Agents per repo.** Multiple agents per repo, using one workflow with one job per agent (D6). Pull-based ingest through the Settings PAT (D1). Base-SHA checkout and fork skip (D7). `pr_id` stays NULL on CI `agent_runs` (D9).
- Recommendations accepted: base-SHA checkout (R1), pull ingest (R2), shared `devdigest/ci` branch (R3), server-side workflow lint (R4), `pr_id` NULL (R5). Fixing the onion violation in `CiService` and the deep imports in `CiTab` during the rewrite (R6) is accepted implicitly through the spec's NFR "service does not import Drizzle" and the client "imports use `@/`" rule.

## Design reference
- Saved at `C:\Users\User\emdash\worktrees\dev-digest-c6709bae\emdash-export-ci-bd5sl\docs\design\export-ci\`: `ci-tab.png`, `wizard-1-target.png`, `wizard-2-preview.png`, `wizard-3-configure.png`, `wizard-4-install.png`, `ci-runs.png`.
- **Implementer must `Read` the matching PNG before building each component** (Steps 11, 12, 13).
- Concrete details the steps must satisfy:
  - **CI tab** (`ci-tab.png`). Heading "Continuous Integration" plus a badge "Active in N repos" (C-AC-1). "Update CI config" is a secondary button and "Add to CI" is primary.
    - The "Fail CI on" card has helper text "Exit non-zero when a finding at or above this severity lands. Pair with a required status check to block merges." and a 3-segment control: Critical | Warning + | Never (C-AC-6).
    - Each installation row shows the repo, a "GitHub Actions" chip, a last-run status chip and a relative time (C-AC-3). Below the rows is a dashed full-width "+ Add repository" button (C-AC-5).
  - **Wizard** (`wizard-1..4`).
    - Modal title "Export to CI", subtitle "Run <Agent> automatically on pull requests". Stepper 1 Target / 2 Preview / 3 Configure / 4 Install, where completed steps show a green check. Footer has Back / Continue, and the last step shows "✓ Install" (C-AC-10).
    - Step 1 is a 2x2 card grid. GitHub Actions is marked "recommended" with "Runs on pull_request events". The other three cards are disabled with a "Coming soon" badge (C-AC-11).
    - Step 2 has a "FILES TO CREATE" list on the left and a file viewer on the right. Only the workflow carries the "editable" badge.
    - **Long file paths are unbroken mono strings.** They must wrap in the list (`overflowWrap: "anywhere"`, `minWidth: 0`, as in client INSIGHTS 2026-09-24) and truncate with a `title` tooltip in the viewer header (C-AC-13).
    - Step 3 has toggle chips `pull_request:opened` / `synchronize` / `reopened`, and a "Secrets expected" table whose status chip reads "verify in repo settings" (not "not set"; C-AC-21).
    - Step 3 also has "Post results as" radios with GitHub review marked recommended, and an info box that ends "No GitHub App needed".
    - Step 4 has two option cards, "Open a PR with these files" (recommended) and "Download zip", plus a "Need help? See the GitHub Action setup docs →" link.
  - **CI Runs** (`ci-runs.png`). Title "CI Runs" and subtitle "Agent reviews executed inside CI · not local runs". An "auto-refresh on" toggle and a Refresh button. Five filters.
    - The table follows the design order. Repository is merged into the PR cell as `owner/repo #N title`, and Verdict and Job link columns are added (C-AC-29). Long titles and repos wrap or ellipsize and never overflow.

## Scope & modules
- **`server/src/vendor/shared` + `client/src/vendor/shared`** (identical hand edits, diff only the touched files):
  - `contracts/eval-ci.ts`
  - `contracts/trace.ts`
  - `adapters.ts`: server copy only, if the client copy doesn't declare `GitHubClient`. Otherwise apply the identical edit there too.
- **`server/`**:
  - `src/modules/ci/*`
  - `src/db/schema/ci.ts`, `src/db/rows.ts`, new migration `0022_*`
  - `src/adapters/github/octokit.ts`, `src/adapters/mocks.ts`
  - `package.json` (+ `yaml`, `fflate`, via `pnpm add`)
  - `test/ci-helpers.test.ts`, `test/ci.it.test.ts`: adapt or delete only
- **`agent-runner/`**: `src/*`, `package.json` build script, `.gitignore`, new committed `bundle/runner.mjs`, README/CLAUDE.md references.
- **`.github/workflows/agent-runner.yml`** (new) and the TESTING.md suite map row.
- **`client/`**:
  - `src/lib/hooks/ci.ts`, `messages/en/ci.json`
  - `src/app/agents/[id]/_components/AgentEditor/_components/CiTab/**`
  - `src/app/ci-runs/_components/CiRunsView/**`
- **Not touched:** `reviewer-core/`, `server/src/modules/reviews/*` (the multi-run service and run-executor), multi-agent, `server/src/modules/pulls/*` (the PR feed), `e2e/`, `client/src/vendor/ui`.

## Architectural constraints
- **Server onion** (onion-architecture SKILL.md ring table):
  - `ci/helpers.ts` is pure. No I/O, no Drizzle, no Fastify.
  - `ci/service.ts` is Ring 1. It depends only on the `GitHubClient` port (`container.github()`), `container.agentsRepo`, `CiRepository`, `SecretsProvider`-backed container accessors and helpers.
  - **Remove** the existing `drizzle-orm` / `db/schema` imports and the `container.db` query in `resolveBaseBranch` from `service.ts`. The default branch now comes from `github.getRepo()` (S-AC-21). Any remaining DB read moves to `repository.ts`.
  - `ci/repository.ts` holds all Drizzle access, including the ingest transaction (S-AC-40/41).
  - `ci/routes.ts` is transport only, with zod schemas on params, body and query (server/AGENTS.md: never call `Schema.parse(req.body)` by hand).
- **New GitHub capabilities are port methods** on `GitHubClient` (`vendor/shared/adapters.ts`), implemented in `adapters/github/octokit.ts` and mirrored in `MockGitHubClient`. Services never import `octokit`.
- **Errors use the existing taxonomy** in `server/src/platform/errors.ts`:
  - lint failure: `new ValidationError('Workflow lint failed', { violations })`, which gives 422 with `details` (S-AC-20)
  - missing workflow scope: `new AppError('pat_workflow_scope', msg, 403)` (S-AC-25)
  - Clients read `ApiError.code` / `ApiError.details` from `client/src/lib/api.ts`.
- **Secrets.**
  - The server reads the PAT only through `SecretsProvider` / `container.github()`.
  - agent-runner reads `process.env` by design (`agent-runner/CLAUDE.md`).
  - No secret is ever written to a generated file, artifact row, trace or log (S-AC-7, S-AC-37, S-AC-40).
- **agent-runner invariants** (`agent-runner/CLAUDE.md`) stay unchanged: the `groundFindings` gate is mandatory, prompt assembly goes through `assemblePrompt`, and the verdict and exit code come from the deterministic gate.
- **Client** (react-project-structure):
  - Pages stay thin.
  - Each component lives in a colocated `_components/<Name>/` folder with `<Name>.tsx`, `index.ts`, `styles.ts` and optional `helpers.ts` / `constants.ts`.
  - Hooks live only in `src/lib/hooks/ci.ts`. Types come from `@devdigest/shared`. Imports use `@/` (user memory rule).
- **Do-not-touch.**
  - `vendor/shared` is edited only through identical hand edits in both trees, per server/INSIGHTS 2026-09-15 and 2026-09-30.
  - Lock files are regenerated only by `pnpm add` / `pnpm install`.
  - Committed migrations are never edited; `0022_*` is generated by `pnpm db:generate`.
  - `client/src/vendor/ui` is not edited.

## Relevant INSIGHTS.md
- `server/INSIGHTS.md`:
  - **2026-09-30**: the vendored shared trees already differ, so diff only `contracts/eval-ci.ts`, `contracts/trace.ts` and `adapters.ts` after editing.
  - **2026-09-15**: new fields on widely produced contracts must be `.nullish()`. This applies to `CiInstallation`, `CiRun` and `RunTrace.config`.
  - **2026-09-15**: the "owning package" is the two hand-synced trees.
- `client/INSIGHTS.md`:
  - **2026-09-30**: same vendored-tree rule.
  - **2026-09-24**: unbreakable mono strings (file paths, repo names, SHAs) need `overflowWrap: "anywhere"` + `minWidth: 0`. Severity counts use `SeverityCountBadges` (`@/components/findings-tooltip`).
- `agent-runner/insights/INSIGHTS.md` (2026-07-08):
  - Run `pnpm install` in `reviewer-core/` before agent-runner typecheck.
  - ncc fully inlines the aliases. Verify there are zero `@devdigest/*` imports in the bundle.
  - Discriminate `RunCiResult` on `artifact === null`.
  - Do not regress the trailing-`\n` fix in `diff.ts`.
  - **The Open Question about `post_as` is closed by Step 4** (`post_as` now lives in the manifest).

## Skills the implementer will apply
| Skill | Why it applies | Key rule the implementer must not violate |
|---|---|---|
| zod | Shared `AgentManifest` / `CiResultArtifact` / `CiExportInput` contracts consumed by both studio and runner | `CiResultArtifact` is `.strict()` and parsed with `safeParse` on untrusted input; use `z.input` for request bodies with defaults; new optional fields are `.nullish()` |
| onion-architecture | New `GitHubClient` port methods; ci service/repository rework | Service depends on ports only, with no Drizzle import in `service.ts`; adapters implement the port |
| fastify-best-practices | `ci/routes.ts` endpoints (JSON + binary zip reply) | Schemas on params, body and query through the type provider; no hand parsing; binary reply sets `content-type` / `content-disposition` |
| drizzle-orm-patterns | Schema changes, upsert, ingest transaction | One `db.transaction` for `agent_runs` + `run_traces` + `ci_runs`; `onConflictDoNothing/DoUpdate` on the new unique indexes |
| postgresql-table-design | New columns and unique indexes | GitHub ids as `bigint`; unique `(agent_id, repo)` and `(ci_installation_id, github_run_id, run_attempt)` |
| security | Workflow generation and lint, artifact verification, secret handling | No `${{ }}` in `run:`; SHA-pinned `uses:`; least-privilege `permissions`; never `pull_request_target`; never log or persist secrets; trust GitHub run metadata, not artifact claims |
| tanstack-query | `src/lib/hooks/ci.ts` rewrite, sync mutation, auto-refresh | Hooks only in `lib/hooks`; stable query keys; invalidate `["agent-ci", id]` and `["ci-runs"]` on export/sync success; `refetchInterval` turned off when the toggle is off |
| react-project-structure | ExportWizard and its steps, FailCiOnCard, CiRunsView rework | Colocated `_components/<Name>/` with barrel; logic in `helpers.ts`, not in component bodies; `@/` imports |
| typescript-expert | agent-runner ESM bundle, discriminated unions | Keep `artifact === null` narrowing; no `any` leaks from parsed YAML |
| engineering-insights | `agent-runner/CLAUDE.md` mandates it at the end of a session; server and client discoveries | Write each entry to the module where it happened (doc-writer phase) |

## Dependency DAG and parallel batches

```
0d (housekeeping, orchestrator)

Batch A  [P]: 1 (shared contracts) ─┐   2 (GitHub port + adapters)   3 (DB schema + migration)
Batch B  [P]: 4 (agent-runner, needs 1)      6 (ci helpers, needs 1)
Batch C  [P]: 5 (runner bundle + CI, needs 4)   7 (ci repository + service, needs 1,2,3,6)
Batch D  [S]: 8 (sync/ingest, needs 7)
Batch E  [S]: 9 (routes + adapt server tests, needs 7,8)
Batch F  [S]: 10 (client hooks + i18n, needs 1,9)
Batch G  [P]: 11 (ExportWizard, needs 10)   13 (CiRunsView, needs 10)
Batch H  [S]: 12 (CiTab redesign, needs 10,11)
Batch I  [S]: 15 (doc-writer + engineering-insights, needs all)
```

Owned paths per parallel batch (no overlaps):
- **Batch A.**
  - Step 1: `*/vendor/shared/contracts/{eval-ci,trace}.ts`
  - Step 2: `*/vendor/shared/adapters.ts`, `server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts`
  - Step 3: `server/src/db/schema/ci.ts`, `server/src/db/rows.ts`, `server/src/db/migrations/0022_*` + `meta/`
- **Batch B.**
  - Step 4: `agent-runner/src/**`, `agent-runner/package.json`, `agent-runner/.gitignore`
  - Step 6: `server/src/modules/ci/{helpers,constants}.ts`, `server/package.json`, `server/pnpm-lock.yaml`, `server/test/ci-helpers.test.ts`
- **Batch C.**
  - Step 5: `agent-runner/bundle/runner.mjs`, `.github/workflows/agent-runner.yml`, `TESTING.md`
  - Step 7: `server/src/modules/ci/{repository,service}.ts`
- **Batch G.**
  - Step 11: `.../CiTab/_components/ExportWizard/**`, deletion of `.../CiTab/_components/PublishDialog/**`
  - Step 13: `client/src/app/ci-runs/_components/CiRunsView/**`

All `messages/en/ci.json` edits are owned by Step 10 so that Steps 11–13 never touch the same file.

## Steps

**Phase 0: prerequisites**
- 0a. Done: spec-creator updated SPEC-03 (both specs).
- 0b. Done: design PNGs saved to `docs/design/export-ci/`.
- 0c. Done: pinned SHAs resolved:
  - `actions/checkout` v4.4.0 = `11d5960a326750d5838078e36cf38b85af677262`
  - `actions/setup-node` v4.4.0 = `49933ea5288caeca8642d1e84afbd3f7d6820020`
  - `actions/upload-artifact` v4.6.2 = `ea165f8d65b6e75b540449e92b4886f43607fa02`
- 0d. **[S] Housekeeping (orchestrator, not implementer).** Delete the untracked `.playwright-mcp/` directory and `agents.yml` at the worktree root. Infrastructural, no AC.

**Phase 1: contracts and schema (Batch A)**

1. **[P] Shared contracts.** Make identical edits in `server/src/vendor/shared/contracts/eval-ci.ts` and `client/src/vendor/shared/contracts/eval-ci.ts`, and in both `contracts/trace.ts` files.
   → S-AC-4, S-AC-9, S-AC-24, S-AC-35, S-AC-40, S-AC-44, C-AC-13/14/16/17 (response shapes)
   - `AgentManifest` adds:
     - `manifest_version: z.number().int().default(1)`
     - `slug: z.string().regex(/^[a-z0-9-]+$/)`
     - `post_as: z.enum(['github_review','pr_comment','none']).default('github_review')`
   - `CiResultArtifact` becomes `.strict()` and adds:
     - `schema_version`, `repository` (`owner/name`), `repository_id` (int)
     - `commit_sha` (`/^[0-9a-f]{40}$/`), `run_id`, `run_attempt` (int)
     - `verdict` (the existing `Verdict` enum or the gate event), `blockers`, `gate_triggered`
     - `model`, `manifest_version`, `dependencies: {runner, node}`
     - `agent_slug` (needed for the S-AC-35 slug check)
   - `CiExportInput`:
     - `triggers` becomes `z.array(z.enum(['opened','synchronize','reopened'])).min(1)` (S-AC-9)
     - add `workflow_yaml: z.string().max(200_000).nullish()`
     - `target` stays `CiTarget` but the service accepts only `gha`
   - Add response contracts:
     - `CiPreview { files: CiFile[] (runner entry has metadata {size_bytes, runner_version, sha256} and empty contents), warnings: string[] }`
     - `CiLintViolation { rule, location, message }`
     - `CiSyncResult { ingested, failed, skipped, throttled }`
     - `AgentCiOverview { installations, recent_runs }`
   - `CiInstallation` and `CiRun` get only `.nullish()` additions, matching the new DB columns and the S-AC-44 row fields (`repo`, `pr_title`, `agent_name`, `duration_ms`, `critical`, `warning`, `suggestion`, `verdict`, `ingest_error`, `agent_run_id`, `job_url`, `commit_sha`, `workflow_version`, `pr_url`, `out_of_date`, `last_run_status`, `last_run_at`).
   - `RunTrace.config` adds `.nullish()` `commit_sha`, `manifest_version`, `repo`, `dependencies`.
   - Afterwards run `diff` on exactly these files between the two trees and confirm they are identical.
   - Verify: `pnpm typecheck` in `server/` and `client/` (expect breaks only in ci files, fixed by later steps); diff the touched files.

2. **[P] GitHub Actions port.** Extend `GitHubClient` in `vendor/shared/adapters.ts` (both trees if the client copy declares it).
   → S-AC-21, S-AC-32, S-AC-34, S-AC-35, S-AC-38, S-AC-39
   - `getRepo(repo) → {id, defaultBranch}`
   - `listWorkflowRuns(repo, workflowFile, {event:'pull_request', perPage}) → {id, runAttempt, status, conclusion, headSha, repositoryId, path, htmlUrl, pullRequests:{number}[], createdAt}[]`
   - `listRunArtifacts(repo, runId) → {id, name, sizeInBytes, expired}[]`
   - `downloadArtifact(repo, artifactId, maxBytes) → Uint8Array`. It throws a typed error when the size exceeds `maxBytes`, checking `sizeInBytes` first and then the streamed length.
   - Implement in `server/src/adapters/github/octokit.ts` (`octokit.rest.actions.*`, `repos.get`).
   - Add the same methods to `MockGitHubClient` in `server/src/adapters/mocks.ts`: simple in-memory fixtures, no new test files.
   - Verify: `pnpm typecheck` (server); existing `server/test/adapters.test.ts` stays green.

3. **[P] DB schema and migration.** Edit `server/src/db/schema/ci.ts`.
   → S-AC-24, S-AC-36, S-AC-40, S-AC-42, S-AC-43, S-AC-44
   - `ci_installations` adds:
     - `github_repo_id bigint`, `branch text`, `workflow_path text`
     - `workflow_version int`, `manifest_version int`
     - `exported_ci_fail_on text`, `post_as text`, `triggers jsonb`
     - `pr_url text`, `last_synced_at timestamptz`
     - **unique index `(agent_id, repo)`**
   - `ci_runs` adds:
     - `agent_run_id uuid FK → agent_runs.id ON DELETE SET NULL`
     - `github_run_id bigint`, `run_attempt int`, `commit_sha text`
     - `pr_title text`, `verdict text`
     - `critical`, `warning`, `suggestion`, `blockers` (int)
     - `duration_ms int`, `model text`, `manifest_version int`
     - `job_url text`, `ingest_error text`, `agent_slug text`
     - **unique index `(ci_installation_id, github_run_id, run_attempt)`**
   - Run `pnpm db:generate` to produce `0022_*`. If existing duplicate `(agent_id, repo)` rows could block the unique index, prepend a dedupe statement through a `drizzle-kit generate --custom` migration ordered before it.
   - Update `src/db/rows.ts` row types.
   - Verify: `pnpm typecheck`; `pnpm db:migrate` against `docker compose up -d` applies cleanly.

**Phase 2: runner and server helpers (Batch B, then C)**

4. **[P, after 1] agent-runner changes.**
   → S-AC-5, S-AC-7, S-AC-17, S-AC-27, S-AC-35 (producer side)
   - `src/manifest.ts`: select `.devdigest/agents/<DEVDIGEST_AGENT>.yaml` when the env var is set, and validate the slug `^[a-z0-9-]+$` before building the path. Keep the single-file fallback only when it is unset. Check that `manifest.slug` matches the file name.
   - `src/index.ts`:
     - `post_as` comes from `manifest.post_as`; the `DEVDIGEST_POST_AS` env var only overrides it.
     - `isDirectRun` uses `pathToFileURL(process.argv[1]).href`.
   - `src/context.ts`: also resolve `head.sha`, `base.repo.id` / `repository.id` from the event payload, and `GITHUB_RUN_ID` / `GITHUB_RUN_ATTEMPT` from env.
   - `src/artifact.ts`:
     - fill every new `CiResultArtifact` field
     - `verdict` comes from the deterministic payload event
     - `dependencies = {runner: RUNNER_VERSION, node: process.version}`
     - set `agent_slug`
     - never include env values
   - New `src/memory.ts`: read `.devdigest/memory.jsonl` and parse non-empty lines into `string[]`. A missing or empty file gives `[]`. Pass the result to `reviewPullRequest({ memory })`.
   - `src/run.ts`: wire memory and the new context fields. The orchestration and hard-fail semantics stay unchanged.
   - `package.json`: `build` becomes `ncc build src/index.ts -o dist && node scripts/copy-bundle.mjs`, or an equivalent that emits **`bundle/runner.mjs`** (ESM, `.mjs`) with a `// devdigest-runner <RUNNER_VERSION>` banner.
   - Bump `RUNNER_VERSION` to `'2'`.
   - `.gitignore` keeps `dist/` ignored and does **not** ignore `bundle/`.
   - Existing `manifest.test.ts`, `run.test.ts` and `diff.test.ts`: adapt only where signatures changed (for example new required context fields in fixtures). Add no new cases.
   - Update stale path references in `agent-runner/README.md` / `CLAUDE.md`: `.devdigest/runner/index.js` becomes `.devdigest/runner.mjs`, and the nonexistent `ci/workflow.ts` / `manifest.ts` become `ci/helpers.ts`. (Doc-writer may polish these.)
   - Verify: `cd reviewer-core && pnpm install` once, then in `agent-runner/` run `pnpm install`, `pnpm typecheck`, `pnpm test` and `pnpm build`. Then run `grep -cE "^import|require\(" bundle/runner.mjs` and confirm it finds no `@devdigest/*` import, and run `node bundle/runner.mjs` with no env, which should exit 1 with a clear RunnerError and no stack containing env values.

5. **[P, after 4] Committed bundle and runner CI.**
   → S-AC-27
   - Commit `agent-runner/bundle/runner.mjs` as produced by Step 4's build.
   - Add `.github/workflows/agent-runner.yml`:
     - triggers: `push`/`pull_request` with `paths` covering `agent-runner/**`, `reviewer-core/**`, `server/src/vendor/shared/**` and the workflow file itself
     - `permissions: contents: read`
     - actions pinned to the SHAs from 0c
     - jobs: install, typecheck, the existing `pnpm test`, `pnpm build`, then `git diff --exit-code agent-runner/bundle/runner.mjs` as the bundle drift check
   - Add an `agent-runner` row to the `TESTING.md` suite map.
   - Verify: run the drift check locally by rebuilding and confirming that `git diff` is empty; check the YAML by eye for the pins and permissions.

6. **[P, after 1] ci pure helpers and constants.** Files: `server/src/modules/ci/helpers.ts`, `constants.ts`.
   → S-AC-1, S-AC-2, S-AC-4, S-AC-5, S-AC-6, S-AC-7, S-AC-8, S-AC-10, S-AC-11, S-AC-12, S-AC-13, S-AC-14, S-AC-15, S-AC-16, S-AC-17, S-AC-18, S-AC-19, S-AC-22, S-AC-28, S-AC-35, S-AC-37, S-AC-39
   - **Constants:**
     - `CI_BRANCH='devdigest/ci'`
     - `WORKFLOW_PATH='.github/workflows/devdigest-review.yml'`
     - `RUNNER_PATH='.devdigest/runner.mjs'`
     - `MANIFEST_VERSION=1`, `WORKFLOW_VERSION=1`
     - `PR_TITLE='Add DevDigest CI review'`
     - `PINNED_ACTIONS` with the three SHAs from 0c, each with a version comment
     - `SYNC_THROTTLE_MS=30_000`, `ARTIFACT_MAX_BYTES=10*1024*1024`, `AGENT_RECENT_RUNS=10`
     - `ALLOWED_PERMISSIONS={contents:'read','pull-requests':'write'}`
     - `SECRET_PATTERNS=[/sk-or-/, /ghp_/, /gho_/, /ghs_/, /github_pat_/]`
     - Delete `ciBranch(slug)`, `configPath`, and the old `workflowPath(slug)`.
   - **`mapModel(provider, model)`**: non-openrouter becomes `{provider:'openrouter', model:'<provider>/<model>', warning}` (S-AC-6).
   - **`buildManifestYaml(agent, skillSlugs, {post_as})`**:
     - serialize with `yaml`
     - round-trip through `AgentManifest.parse` and throw on mismatch
     - write `ci_fail_on` from `agent.ciFailOn` (S-AC-4, S-AC-28)
     - must not contain secrets (S-AC-7)
   - **`buildSkillFiles(skills)`**: one `.devdigest/skills/<slug>.md` per enabled, non-scan-blocked skill, with collision-safe slugs.
   - **`buildMemoryJsonl()`** returns `''` (S-AC-5).
   - **`buildWorkflowYaml({agents:[{slug}], triggers})`** emits YAML with:
     - a header comment `# devdigest-workflow-version: <N>` (S-AC-18)
     - `on: pull_request: types: [...]` (S-AC-8)
     - top-level `permissions: {contents: read, pull-requests: write}` (S-AC-10)
     - `concurrency: devdigest-${{ github.event.pull_request.number }}` with `cancel-in-progress` (an expression is allowed at job or workflow level, never inside `run:`)
     - one job per agent, each with:
       - `if: github.event.pull_request.head.repo.full_name == github.repository` (S-AC-13)
       - `timeout-minutes`
       - a checkout step pinned by SHA with `ref: ${{ github.event.pull_request.base.sha }}` and `persist-credentials: false` (S-AC-11, S-AC-12)
       - a setup-node step pinned by SHA (`node-version: 20`)
       - `run: node .devdigest/runner.mjs`
       - `env: {DEVDIGEST_AGENT: <slug>, PR_NUMBER: ${{ github.event.pull_request.number }}, GITHUB_TOKEN: ${{ github.token }}, OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}}` (S-AC-15, S-AC-16, S-AC-17)
       - an upload-artifact step pinned by SHA, with `if: always()`, `name: devdigest-result-<slug>`, `path: devdigest-result.json`, `if-no-files-found: ignore` and `retention-days: 14` (S-AC-17)
     - never `pull_request_target` (S-AC-14)
   - **`lintWorkflow(text) → CiLintViolation[]`**: parse with `yaml`, so a parse error is itself a violation. Rules (S-AC-19):
     - `permissions.missing`
     - `permissions.too_broad`, raised for any key or value outside `ALLOWED_PERMISSIONS`, including `write-all`
     - `event.pull_request_target`
     - `uses.not_pinned`, unless the value matches `@[0-9a-f]{40}$`; local `./` actions are also rejected
     - `run.untrusted_expression`, raised for a `run:` containing `${{` with `github.event.` or `head_ref`, or any `${{` per S-AC-15
     - each violation has a `location` (`jobs.<id>.steps[<i>]`)
   - **`runnerMetadata(bytes)`** returns `{size_bytes, runner_version (parsed from the banner), sha256}` (S-AC-2, S-AC-27).
   - **`buildPrBody({agents, runnerMeta})`**: an `OPENROUTER_API_KEY` secrets checklist, the runner version and hash, a CODEOWNERS / branch-protection recommendation for `.github/workflows/devdigest-review.yml`, and the required PAT scopes (S-AC-22).
   - **`extractResultFromZip(bytes)`** (`fflate` `unzipSync`):
     - the total and per-entry uncompressed size is capped by `ARTIFACT_MAX_BYTES`
     - the archive must contain exactly `devdigest-result.json`
     - error codes `artifact_too_large` / `artifact_missing` (S-AC-38, S-AC-39)
   - **`scanForSecrets(text)`** returns a boolean (S-AC-37).
   - **`verifyArtifact(artifact, run, installation)`** returns `{ok} | {ok:false, check}`. It runs the checks in S-AC-35 order:
     - `schema`
     - `commit_sha`
     - `repository_id` (both the installation and the run)
     - `pull_request`
     - `workflow_path`
     - `agent_slug`
   - Remove `buildAgentConfig` and `providerSecretKey` (the latter was only used by the old flow). **Keep `slugify`.**
   - `pnpm add yaml fflate` in `server/`, which regenerates the lockfile.
   - `server/test/ci-helpers.test.ts`: **delete** the cases for `buildAgentConfig`, `buildWorkflowYaml` and `providerSecretKey` (the code they cover is removed or replaced). Keep the `slugify` cases unchanged. Add nothing.
   - Verify: `pnpm typecheck`; `pnpm exec vitest run --exclude '**/*.it.test.ts'` stays green. By eye, check a `buildWorkflowYaml` output printed from a scratch `node -e` against S-AC-8..18, and make sure the scratch script is not committed.

7. **[S, after 1, 2, 3, 6] ci repository and service: preview, export, zip, agent overview.** Files: `server/src/modules/ci/repository.ts`, `service.ts`.
   → S-AC-1, S-AC-2, S-AC-3, S-AC-6, S-AC-9, S-AC-20, S-AC-21, S-AC-22, S-AC-23, S-AC-24, S-AC-25, S-AC-26, S-AC-27, S-AC-28, S-AC-29, S-AC-30, S-AC-31
   - **Repository:**
     - `upsertInstallation(values)` uses `onConflictDoUpdate` on `(agent_id, repo)` with all S-AC-24 metadata
     - `listInstallationsForAgent(agentId)` with the last run status and time (lateral or subquery on `ci_runs`)
     - `listInstallationsForRepo(repo, workspaceId)`, used to build one job per installed agent (S-AC-17)
     - `recentRunsForAgent(agentId, 10)` (S-AC-31)
     - `listRepos(workspaceId)` (S-AC-45, used in Step 9)
     - remove the old select-then-insert upsert
   - **Runner bundle access.** Load `agent-runner/bundle/runner.mjs` bytes. Add a small `RunnerBundleProvider` port, or an existing config/path accessor on the container, so the service doesn't use `fs` directly. Resolve it relative to the server's repo root and fail with a `ConfigError` if the file is missing. If adding a port, put the interface server-local (`server/src/adapters/`), not in vendored shared, and register it in `src/platform/container.ts`.
   - **`preview(workspaceId, agentId, input)`** makes no writes (S-AC-3):
     - reject `target !== 'gha'` with a `ValidationError`
     - load the agent and its enabled skills
     - `mapModel` produces the warnings
     - if `input.workflow_yaml` is present, `lintWorkflow`; on violations throw `ValidationError('Workflow lint failed', {violations})` (S-AC-20)
     - the workflow is built for this agent plus the agents already installed on `input.repo`
     - return `CiPreview`, with the runner described by metadata only (S-AC-1, S-AC-2, S-AC-6)
   - **`export(workspaceId, agentId, input)`**:
     1. Build the same file set as preview; lint the edited YAML if present (S-AC-20). The edited workflow replaces the generated one.
     2. `github = await container.github()`; `repoInfo = github.getRepo()`, used for the default branch and id (S-AC-21).
     3. `commitFiles({branch: CI_BRANCH, base: repoInfo.defaultBranch, files: [... runner bytes byte-for-byte as a UTF-8 string ...]})` (S-AC-21, S-AC-27).
     4. `findOpenPr(CI_BRANCH)`, reusing it if found (S-AC-23), else `openPullRequest({title: PR_TITLE, body: buildPrBody(...)})` (S-AC-22).
     5. Upsert the installation with `exported_ci_fail_on = agent.ciFailOn`, `manifest_version`, `workflow_version`, `post_as`, `triggers`, `pr_url`, `github_repo_id` and `branch` (S-AC-24, S-AC-28).
     6. A GitHub 403/404 raised while committing under `.github/workflows/` becomes `new AppError('pat_workflow_scope', 'The GitHub token needs the "workflow" scope (classic) or Workflows: write (fine-grained) to add .github/workflows files.', 403)` (S-AC-25). Any other GitHub error becomes an `ExternalServiceError`. Never include the token in a message.
   - **`zip(workspaceId, agentId, input)`** uses the same file set and **runner body** packed with `fflate` `zipSync`. It makes no GitHub call and no DB write (S-AC-26).
   - **`agentOverview(workspaceId, agentId)`** returns `{installations: [... out_of_date: agent.ciFailOn !== inst.exportedCiFailOn ...], recent_runs}` (S-AC-29, S-AC-30, S-AC-31).
   - Remove `publish`, the old `preview`, `resolveBaseBranch` and every `drizzle-orm` / `db/schema` import from `service.ts`.
   - Verify: `pnpm typecheck`; `grep -n "drizzle-orm\|db/schema" server/src/modules/ci/service.ts` returns nothing.

8. **[S, after 7] Sync and verified ingest.** Files: `server/src/modules/ci/service.ts` (`sync`) and `repository.ts` (ingest transaction).
   → S-AC-32, S-AC-33, S-AC-34, S-AC-35, S-AC-36, S-AC-37, S-AC-38, S-AC-39, S-AC-40, S-AC-41, S-AC-42, S-AC-43
   - **Throttle.** A per-workspace in-memory `{at, result}` cache. A call within `SYNC_THROTTLE_MS` returns the cached result with `throttled: true` and makes no GitHub call (S-AC-33).
   - For each installation in the workspace (gha only), call `listWorkflowRuns(repo, 'devdigest-review.yml', {event:'pull_request'})`. Then for each run:
     - **Skip** runs where `status !== 'completed'` (S-AC-34).
     - **Skip** `(installation, run id, attempt)` triples that are already stored, through `repo.existingRunKeys(...)` (S-AC-42).
     - Find the artifact `devdigest-result-<installation agent slug>`:
       - missing gives `failed` / `artifact_missing`
       - `expired` gives `failed` / `artifact_expired` (S-AC-38)
     - Download it with `ARTIFACT_MAX_BYTES`; an oversize file gives `artifact_too_large` (S-AC-39). Then `extractResultFromZip`.
     - Run `scanForSecrets` on the raw JSON text **before** parsing. A hit gives `failed` / `secret_detected`, and none of the artifact content is persisted: only GitHub metadata (S-AC-37).
     - `CiResultArtifact.safeParse` followed by `verifyArtifact` against the GitHub run and the installation. Failure gives a `ci_runs` row with `status='failed'`, `ingest_error='verification_failed:<check>'` and **no** `agent_runs` / `run_traces` rows (S-AC-35, S-AC-36).
     - On success, `repo.ingestVerifiedRun(...)` runs in **one `db.transaction`** (S-AC-40, S-AC-41):
       - insert `agent_runs` with `workspaceId`, `agentId`, `prId: null`, `source: 'ci'`, provider `openrouter`, `model`, `durationMs`, `costUsd`, `findingsCount`, `blockers`, and `status` (`done`, or `failed` if the run concluded failure without a gate)
       - insert `run_traces` with `trace = buildRunTrace({config: {agent, version: String(manifest_version), provider: 'openrouter', model, pr, source: 'ci', commit_sha, manifest_version, repo, dependencies}, stats, promptAssembly: emptyPromptAssembly('', ''), toolCalls: [], rawOutput: '', memoryPulled: [], specsRead: [], log: []})`. Reuse `server/src/platform/trace-builder.ts` and extend `BuildTraceInput.config` with the new nullish fields. No secrets.
       - insert `ci_runs` with `agent_run_id`, repo through the installation, `pr_number`, `pr_title` (fetched through the existing `getPullRequest` port, or left null if that fails), `commit_sha`, `verdict`, the severity counts, `duration_ms`, `cost_usd`, `model`, `github_run_id`, `run_attempt`, `job_url = run.htmlUrl` (**from the API, never the artifact**), `status` (`succeeded` | `no_findings` | `failed`), `source = 'gha'`, `ran_at` and `agent_slug`
     - Use `onConflictDoNothing` on the unique key so concurrent syncs never duplicate (S-AC-42).
   - Update `last_synced_at` per installation and return `{ingested, failed, skipped, throttled}` (S-AC-43).
   - Verify: `pnpm typecheck`; by code inspection, check the transaction boundary and that no `agent_runs` insert happens on the failure paths.

9. **[S, after 7, 8] Routes and adapting existing server tests.** File: `server/src/modules/ci/routes.ts`.
   → S-AC-9, S-AC-20, S-AC-25, S-AC-26, S-AC-31, S-AC-32, S-AC-44, S-AC-45
   - Routes:
     - `GET /agents/:id/ci` → `agentOverview`
     - `POST /agents/:id/ci/preview` (body `CiExportInput`)
     - `POST /agents/:id/ci/export` (body `CiExportInput`, `action:'open_pr'`)
     - `POST /agents/:id/ci/zip` replies with `application/zip` and `content-disposition: attachment; filename="devdigest-ci-<slug>.zip"`
     - `POST /ci-runs/sync`
     - `GET /ci-runs?period=24h|7d|30d&agent_id=&repo=&status=&source=`, newest first, filters joined with AND, returns the S-AC-44 row shape (S-AC-44)
     - `GET /ci-runs/repos`
   - Zero triggers fail the zod `.min(1)`, which the global handler turns into a 422 (S-AC-9).
   - **Delete** `POST /agents/:id/ci/publish` and the old `GET /agents/:id/ci/preview` (S-AC-45). Update `repository.listRuns` for the new filters and fields.
   - `server/test/ci.it.test.ts`: **delete** the cases that exercise the removed publish/preview endpoints, including the publish-idempotency case. Minimally adapt any remaining `GET /ci-runs` / `GET /agents/:id/ci` case to the new response shape: assertions are only changed or removed, never added. If nothing meaningful remains, delete the file.
   - Verify:
     - `pnpm typecheck`
     - `pnpm exec vitest run --exclude '**/*.it.test.ts'`
     - `pnpm exec vitest run .it.test` (Docker) stays green
     - with `pnpm dev`, manual `curl` checks:
       - preview with `triggers: []` returns 422 (S-AC-9)
       - preview with an edited workflow containing `pull_request_target` and `uses: actions/checkout@v4` returns 422 listing both violations (S-AC-20)
       - `curl -o x.zip` of `/zip` succeeds and `unzip -l` shows 5+ files including `runner.mjs` (S-AC-26)
       - `/agents/:id/ci/publish` returns 404 (S-AC-45)

**Phase 3: client**

10. **[S, after 1, 9] Hooks and i18n.** Rewrite `client/src/lib/hooks/ci.ts` (load the tanstack-query skill first) and update `client/messages/en/ci.json`.
    → C-AC-7, C-AC-17, C-AC-24, C-AC-25, C-AC-26, C-AC-27, C-AC-30, C-AC-31, C-AC-32, C-AC-22 (copy)
    - Types are imported from `@devdigest/shared` (`CiPreview`, `CiExportInputBody`, `CiExport`, `CiRun`, `AgentCiOverview`, `CiSyncResult`). The hand-written interfaces are deleted.
    - Hooks:
      - `useAgentCi(agentId)` with key `["agent-ci", agentId]`
      - `useCiPreview()`: a mutation, because it POSTs the edited YAML
      - `useExportCi()`: on success, invalidate `["agent-ci", agentId]` and `["ci-runs"]` (C-AC-27)
      - `useDownloadCiZip()`: a fetch for the blob that triggers the download. It does not invalidate the agent-CI query (C-AC-26).
      - `useSyncCiRuns()`: on settle, invalidate `["ci-runs"]`
      - `useCiRuns(filters)` with key `["ci-runs", filters]`
      - `useCiRepos()` with key `["ci-runs", "repos"]`
    - If `client/src/lib/api.ts` lacks a blob helper, add a minimal `api.postBlob` there. That is a small, scoped edit.
    - `ci.json`:
      - add the keys for `ciTab.*` (heading "Continuous Integration", `activeIn`, `addToCi`, `updateCiConfig`, `addRepository`, `outOfDate`, `failCiOn.*`, `recentRuns`, `trace`)
      - add `exportWizard.*` (`comingSoon`, steps, `secrets.*` with "verify in repo settings", `infoBox` with a `{failOn}` placeholder, `install.*`, `lint.*`, `modelWarning`, `done.*`, the `pat_workflow_scope` message fallback)
      - add `runs.*` (columns repository, agent, duration, verdict, trace, job; filters period 24h/7d/30d, source; `ingestError.*`; fix `status.no_findings`)
      - **remove** `exportWizard.blockMergeTitle`/`blockMergeDesc` ("Requires a GitHub App"; C-AC-22) and all `publishDialog.*`
      - rewrite `runs.emptyBody` to refer to exporting (spec edge case)
    - Verify: `pnpm typecheck` (client); expect remaining errors only in CiTab / CiRunsView, fixed by Steps 11–13.

11. **[P, after 10] ExportWizard** (replaces PublishDialog). Location: `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/`. Implementer must `Read` `docs/design/export-ci/wizard-1-target.png` … `wizard-4-install.png` first.
    → C-AC-10, C-AC-11, C-AC-12, C-AC-13, C-AC-14, C-AC-15, C-AC-16, C-AC-17, C-AC-18, C-AC-19, C-AC-20, C-AC-21, C-AC-22, C-AC-23, C-AC-24, C-AC-25, C-AC-26, C-AC-28
    - **Public props** (so Step 12 can consume them): `ExportWizard({ agent: Agent; initial?: { repo?: string; triggers?: CiTrigger[]; post_as?: PostAs }; onClose: () => void })`.
    - **Files:**
      - `ExportWizard.tsx`, `index.ts`, `styles.ts`
      - `helpers.ts`: a pure reducer for the wizard state (step, repo, workflowDraft, edited flag, triggers, post_as, lint violations), plus `isRepo(owner/name)`
      - `constants.ts`: targets list with `gha` enabled and `circle`/`jenkins`/`cli` `disabled: true`; trigger values
      - `_components/WizardStepper/`: current step marked with `aria-current="step"`; completed steps get a green check (C-AC-10)
      - `_components/TargetStep/`: 2x2 cards. Disabled cards have `aria-disabled="true"`, no `onClick` / `onKeyDown` selection and a "Coming soon" badge (C-AC-11). The repo `TextInput` sits under the cards, and Continue stays disabled until `isRepo` passes (C-AC-12; client A1).
      - `_components/PreviewStep/`:
        - the file list wraps with `overflowWrap:"anywhere"; minWidth:0` (C-AC-13)
        - the runner entry shows only size, version and hash (C-AC-14)
        - the workflow is an editable `<textarea>`; other files are read-only `<pre>` (C-AC-15)
        - model warnings appear as an inline notice (C-AC-16)
        - **Lint.** Continue calls `useCiPreview` with `workflow_yaml` when edited. A 422 maps `error.details.violations` into a list of rule + location, and the wizard stays on Preview (C-AC-17).
        - Entering Preview calls preview once. On error it shows the message and returns to Target with Continue enabled (spec edge case).
      - `_components/ConfigureStep/`:
        - trigger chips, all on by default; Continue is disabled when none is selected (C-AC-18, C-AC-19)
        - post-as radios, default GitHub review (C-AC-20)
        - secrets table with `OPENROUTER_API_KEY` and `GITHUB_TOKEN` ("provided by Actions"), both with status "verify in repo settings", no inputs and no secret reads (C-AC-21)
        - info box with the agent's current `ci_fail_on` and the branch-protection sentence (C-AC-22)
        - changing triggers or post_as re-calls preview so that Install's file count and contents stay accurate
      - `_components/InstallStep/`:
        - "Open a PR" card naming the repo, `devdigest/ci`, "Add DevDigest CI review" and the file count (C-AC-23)
        - "Download zip" card
        - the confirm button shows "Installing…" and is disabled while the request is pending; the done state links to `pr_url` (C-AC-24)
        - errors show `ApiError.message`, including `pat_workflow_scope`, and the button is re-enabled (C-AC-25)
        - zip uses `useDownloadCiZip` (C-AC-26)
    - Closing the modal before Install discards the reducer state and has made no export call (C-AC-28).
    - All user-controlled strings render as text, never HTML.
    - **Delete** `CiTab/_components/PublishDialog/**`, including `PublishDialog.test.tsx` (the code it covers is removed).
    - Verify: `pnpm typecheck`; `pnpm test` stays green; manual checks with `./scripts/dev.sh` and `agent-browser`, comparing each step with its PNG.

12. **[S, after 10, 11] CiTab redesign.** Location: `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/`. Implementer must `Read` `docs/design/export-ci/ci-tab.png` first.
    → C-AC-1, C-AC-2, C-AC-3, C-AC-4, C-AC-5, C-AC-6, C-AC-7, C-AC-8, C-AC-9
    - `CiTab.tsx` uses `@/` imports only (replace `../../../../../../../lib/hooks/ci` and `.../core`), plus `useAgentCi`:
      - header "Continuous Integration" with the "Active in N repos" badge (C-AC-1)
      - an empty state with an "Add to CI" button that opens the wizard (C-AC-2)
      - the "Update CI config" button opens the wizard pre-filled from the out-of-date or first installation (C-AC-4)
    - `_components/FailCiOnCard/`:
      - three segments mapped to `critical` / `warning` / `never`
      - stored `any` gives no selected segment and a caption (client A3) (C-AC-6)
      - a change calls `useUpdateAgent()` from `@/lib/hooks/agents` with the full agent payload, the same as ConfigTab sends
      - on success, invalidate `["agent-ci", agent.id]` (C-AC-7)
      - on error, show the existing global toast and revert local state to the stored value (C-AC-8)
    - `_components/InstallationRow/`:
      - shows the repo (wrapping), a "GitHub Actions" chip, `workflow_version`, a last-run status chip, relative time and the PR link (C-AC-3)
      - when `out_of_date`, an "Out of date" badge and an "Update CI config" action that opens the wizard with `{repo, triggers, post_as}` (C-AC-4)
      - "+ Add repository" is a dashed button that opens the wizard with an empty repo (C-AC-5)
    - `_components/RecentCiRuns/`: lists `recent_runs` with status, repo #PR, relative time and a Trace button that opens `RunTraceDrawer` for `agent_run_id` (C-AC-9). Import it through `@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer`, following the StatsTab precedent; see Open questions.
    - `CiTab.test.tsx`: **minimally adapt** the existing assertions to the new copy and hook names, or delete cases for removed behaviour (the "Publish to CI" label). Add no new cases.
    - Verify: `pnpm typecheck`; `pnpm test`. Manually: change Fail CI on and confirm the installation shows "Out of date", Update re-exports and the badge clears (C-AC-7 with S-AC-29/30); force an API error and confirm the toast and revert (C-AC-8).

13. **[P, after 10] CiRunsView rework.** Location: `client/src/app/ci-runs/_components/CiRunsView/`. Implementer must `Read` `docs/design/export-ci/ci-runs.png` first.
    → C-AC-29, C-AC-30, C-AC-31, C-AC-32, C-AC-33, C-AC-34
    - **Columns:** Timestamp; Repository + PR (`owner/repo #N` and title, wrapping); Agent; Source; Dur.; Findings via `SeverityCountBadges` from `@/components/findings-tooltip` (client A6); Cost via `formatRunCost`; Verdict chip; Status chip; Trace; Job link (C-AC-29).
    - **Filters** (C-AC-30):
      - period Select (24 h / 7 d default / 30 d, sent as `period`); this replaces the `since` toggle, so the `since` computation is removed
      - agent Select
      - repo Select from `useCiRepos`
      - status Select
      - source Select
    - **Refresh** calls `useSyncCiRuns().mutate`, shows "Refreshing…" and is disabled while pending. Afterwards it invalidates or refetches `["ci-runs"]`. On error it shows a toast and keeps the rows (C-AC-31).
    - **Auto-refresh** toggle: a `useEffect` interval at `AUTO_REFRESH_INTERVAL_MS = 60_000` calling the same sync-then-refetch, cleared when turned off (C-AC-32). Update `constants.ts`.
    - **Links** (C-AC-33, C-AC-34):
      - Trace opens `RunTraceDrawer` for `agent_run_id` (same import as Step 12)
      - Job link is `<a target="_blank" rel="noopener noreferrer" href={job_url}>`
      - rows with `status==='failed'` and `ingest_error` show the error text and no Trace button
    - `CiRunsView.test.tsx`: **minimally adapt** to the new hooks and columns (update mocked responses and changed labels), or delete obsolete cases. Add nothing.
    - Verify: `pnpm typecheck`; `pnpm test`; manual comparison against `ci-runs.png`, filter combinations, and Refresh/auto-refresh in the network panel.

**Phase 4: documentation (doc-writer, after plan-verifier)**

15. **[S, last] Docs and insights.** No AC; infrastructural.
    - Update `server/README.md` (API map: new ci routes, removed publish).
    - Update `agent-runner/README.md` (env table with `DEVDIGEST_AGENT`, the artifact fields, the `bundle/runner.mjs` build) and `agent-runner/CLAUDE.md` path references.
    - Mark the TESTING.md suite map `agent-runner` row as done (if it isn't already from Step 5).
    - Set SPEC-03 `Status:` in both specs to `implemented`, adding a Changelog line.
    - Run `/engineering-insights` for `server/`, `client/` and `agent-runner/insights/INSIGHTS.md` (agent-runner/CLAUDE.md requires it). Close the agent-runner `post_as` Open Question.

## AC → step coverage

| AC | Step(s) |
|---|---|
| S-AC-1, S-AC-2, S-AC-3 | 6, 7 |
| S-AC-4 | 1, 6 |
| S-AC-5 | 4, 6 |
| S-AC-6 | 6, 7 |
| S-AC-7 | 4, 6, 7 |
| S-AC-8, S-AC-10..S-AC-16, S-AC-18 | 6 |
| S-AC-9 | 1, 9 |
| S-AC-17 | 4, 6, 7 |
| S-AC-19 | 6 |
| S-AC-20 | 7, 9 |
| S-AC-21 | 2, 7 |
| S-AC-22 | 6, 7 |
| S-AC-23 | 7 |
| S-AC-24 | 1, 3, 7 |
| S-AC-25, S-AC-26 | 7, 9 |
| S-AC-27 | 4, 5, 6, 7 |
| S-AC-28 | 6, 7 |
| S-AC-29, S-AC-30 | 7 |
| S-AC-31 | 7, 9 |
| S-AC-32 | 2, 8, 9 |
| S-AC-33, S-AC-34 | 8 |
| S-AC-35 | 1, 4, 6, 8 |
| S-AC-36 | 3, 8 |
| S-AC-37 | 6, 8 |
| S-AC-38, S-AC-39 | 2, 6, 8 |
| S-AC-40 | 1, 3, 8 |
| S-AC-41 | 8 |
| S-AC-42, S-AC-43 | 3, 8 |
| S-AC-44 | 1, 3, 9 |
| S-AC-45 | 7, 9 |
| C-AC-1..C-AC-9 | 12 (C-AC-7 also 10) |
| C-AC-10..C-AC-28 | 11 (C-AC-17, 22, 24–27 also 10) |
| C-AC-29..C-AC-34 | 13 (C-AC-30–32 also 10) |

Steps 0d, 5 and 15 are infrastructural. Step 5 is tied to S-AC-27.

## Test plan (no new tests this iteration)
- **No new tests of any kind** (user decision). Automated verification for the ACs is deferred, as both specs record.
- **Existing tests touched**, only adapted or deleted:
  - `server/test/ci-helpers.test.ts`: delete the `buildAgentConfig`/`buildWorkflowYaml`/`providerSecretKey` cases; keep `slugify` (Step 6).
  - `server/test/ci.it.test.ts`: delete the publish/preview cases; minimally adapt or delete the rest (Step 9).
  - `PublishDialog.test.tsx`: deleted with the component (Step 11).
  - `CiTab.test.tsx` (Step 12) and `CiRunsView.test.tsx` (Step 13): minimally adapted.
  - `agent-runner/src/*.test.ts`: fixture or signature adaptation only (Step 4).
- **Suites that must stay green**, re-run by plan-verifier:
  - `server/`: `pnpm typecheck`, `pnpm exec vitest run --exclude '**/*.it.test.ts'`, `pnpm exec vitest run .it.test` (Docker)
  - `client/`: `pnpm typecheck`, `pnpm test`
  - `agent-runner/`: `pnpm typecheck`, `pnpm test`, `pnpm build`, then the bundle drift `git diff --exit-code agent-runner/bundle/runner.mjs`
  - `reviewer-core/`: `npm test`, a regression check only
- **Migration:** `pnpm db:migrate` applies `0022_*` cleanly on a fresh `docker compose` DB and on an already-seeded DB.
- **Live visual check (required, design reference exists):** with `./scripts/dev.sh`, implementer uses `agent-browser` (see `e2e/README.md`) to compare the CI tab, wizard steps 1–4 and CI Runs against `docs/design/export-ci/*.png`. Check in particular:
  - disabled "Coming soon" cards
  - wrapped long paths
  - stepper checks
  - the secrets "verify in repo settings" chip
  - the new CI Runs columns
- **Manual generated-workflow inspection:** permissions are exactly `contents: read` / `pull-requests: write`; all three `uses:` are pinned to the 0c SHAs; no `${{` inside any `run:`; base-SHA checkout with `persist-credentials: false`; fork `if:`; one job per installed agent; `devdigest-result-<slug>` artifacts.
- **Manual end-to-end on a fork of the demo repo** (the real `OctokitGitHubClient` only, never in tests):
  1. Export, then a PR appears on `devdigest/ci` with the manifest, skills, `memory.jsonl`, `runner.mjs` and the workflow.
  2. Review its permissions, triggers and secret handling.
  3. Add `OPENROUTER_API_KEY`.
  4. Merge, then open a test PR, and confirm the review or comment is posted.
  5. With Fail CI on = Critical, a CRITICAL finding makes the job exit 1; mark it as a required check and confirm it is red.
  6. `gh run view --log` and the downloaded artifact contain no part of the key.
  7. CI Runs Refresh shows the correct repo, PR and SHA, and the job link opens the Actions run; the Trace drawer opens.
  8. Re-run the job and confirm a second row (new attempt).

## Open questions / risks
- **RunTraceDrawer location.** It lives in the PR-detail route folder. Steps 12 and 13 import it through the `@/` alias, as `StatsTab.tsx` already does with a deep relative path. Promoting it to `src/components/` would be cleaner, but it edits PR-page files outside this feature's stated scope. architecture-reviewer may flag this; if so, decide whether a follow-up promotion is wanted.
- **Runner bundle access from the server** (Step 7). The plan prefers a small server-local port over `fs` in the service. It needs a resolvable path to `agent-runner/bundle/runner.mjs` at runtime. In a deployment without the sibling folder, export and zip fail with a `ConfigError`, which is acceptable for a local-first app.
- **Step 5 adds a new CI workflow**, `agent-runner.yml` (typecheck, existing tests, build and drift check). This is CI wiring, not a new test; drop it if the user reads "no new tests" more broadly.
- **Workflow tampering.** Same-repo PRs can edit `devdigest-review.yml` itself. This is mitigated only by the CODEOWNERS / branch-protection advice in the PR body (S-AC-22). Ingest's GitHub-metadata checks (S-AC-35) bound but do not eliminate forged findings.
- **PAT scopes.** Classic needs `repo` + `workflow`. Fine-grained needs Contents, Pull requests and Workflows write, plus Actions read for sync.
- **Artifact retention.** Runs past retention are stored as `artifact_expired`.
- **Accepted:** CI runs appear in agent Stats (agent-performance has no source filter). They never affect PR feed costs (`pr_id` NULL).
- **Throttle scope.** The in-memory sync throttle (S-AC-33) resets on server restart, which is acceptable for a single local process.
- **Vendored drift.** `contracts/eval-ci.ts` and `adapters.ts` already differ between the two vendored trees. Apply identical edits to the hunks you touch and do not try to reconcile the existing drift.

## Explicitly out of scope
- Architectural review and security review. architecture-reviewer runs after implementer as a fix loop; security is not pre-empted here beyond building to S-AC-7/10–16/19/35–37.
- CircleCI, Jenkins and Generic CLI generators: they are disabled stubs only. Also out of scope: a push or webhook ingest endpoint, a memory store, a GitHub App, a hosted `devdigest/review-action`.
- The multi-run service (`server/src/modules/reviews/*`), multi-agent, the PR feed (`server/src/modules/pulls/*`), `reviewer-core/`, and e2e flows.
- Any new automated test.

## Implementer notes: skills to load per step
| Step | Skills to load (via the Skill tool) before editing |
|---|---|
| 1 | zod |
| 2 | onion-architecture, typescript-expert |
| 3 | drizzle-orm-patterns, postgresql-table-design |
| 4 | zod, typescript-expert, security (read `agent-runner/CLAUDE.md` and `insights/INSIGHTS.md` first) |
| 5 | security (workflow permissions and pins) |
| 6 | security, zod, onion-architecture (pure helper ring) |
| 7 | onion-architecture, security, fastify-best-practices (error taxonomy), drizzle-orm-patterns (repository) |
| 8 | drizzle-orm-patterns (transaction), security, zod, onion-architecture |
| 9 | fastify-best-practices, zod |
| 10 | tanstack-query (mandatory per user memory), react-project-structure |
| 11 | react-project-structure, tanstack-query, react-best-practices; `Read` `docs/design/export-ci/wizard-*.png` |
| 12 | react-project-structure, tanstack-query; `Read` `docs/design/export-ci/ci-tab.png` |
| 13 | react-project-structure, tanstack-query; `Read` `docs/design/export-ci/ci-runs.png` |
| 15 | engineering-insights, mermaid-diagram (optional, for the README flow) |

Standing rules for every step:
- Client imports use `@/` and never deep `../../..` paths.
- Docs and comments are in English.
- Any `vendor/shared` edit is mirrored identically in both trees, and only the touched files are diffed.
- Lock files change only through `pnpm add` / `pnpm install`.
- No commits or pushes without asking the user.

