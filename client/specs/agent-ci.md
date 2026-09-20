# Agent Editor — CI tab, Publish to CI, CI Runs

**Status: implemented** (the `publishDialog` one-step flow — see the scope
decision below; `exportWizard`'s multi-CI-system wizard was not built).

## Resolved: `publishDialog`, not `exportWizard`

`ciTab.empty`'s own copy — *"Not deployed to CI yet. Use "Publish to CI" to
open a PR..."* — names the one-step GitHub-only flow as the real way in, not
the 4-step multi-target wizard. Built `publishDialog`; `exportWizard`'s
CircleCI/Jenkins/Generic-CLI targets stay unbuilt (no engine work exists for
those either) — `ciTab.exportToCi`/`exportWizard.*` i18n keys are unused.

`ciTab.publish` ("Publish to CI") and `ciTab.update`/`publishDialog.
republish` ("Update CI" / "Re-publish") are the SAME server action — the
`GitHubClient` interface's `commitFiles`/`findOpenPr` are idempotent by
design (confirmed by reading the adapter, not assumed): a re-publish commits
again on the same branch and reuses the already-open PR instead of opening a
second one. The client just picks the button label from whether a
`ci_installations` row already exists.

## What was built

- `server/src/modules/ci/helpers.ts` (pure) — `buildWorkflowYaml` (a GHA
  workflow on `pull_request`, matching the `devdigest review --pr` CLI shape
  already named in `exportWizard.targets.cliDesc`) and `buildAgentConfig` — a
  portable JSON snapshot with **resolved skill bodies, not ids** (unlike
  `AgentVersionConfig`, which stores ids for this app's own DB-backed
  history — a standalone CI runner has no DB to resolve them against).
- `server/src/modules/ci/service.ts` — `preview` (no side effects) and
  `publish` (commits via `container.github().commitFiles`, resolves the
  target repo's real default branch when it's already tracked in this
  workspace's `repos` table, else falls back to `main`; `findOpenPr` →
  reuse or `openPullRequest`; upserts `ci_installations`).
- Client: CI tab (installations list, Publish/Update button), `PublishDialog`
  (file preview, repo input, done state with a PR link), the global
  `/ci-runs` page (agent/repo/status/date filters via the server's own
  filtered `GET /ci-runs`, auto-refresh toggle).
- Tested entirely against `MockGitHubClient` (`server/src/adapters/mocks.ts`)
  — never invoked the real GitHub adapter. The integration test's key
  assertion is the idempotency: publishing twice for the same agent+repo
  commits twice but opens exactly one PR.

## Known, expected gap

`/ci-runs` renders empty by design — no CI *runner* exists (a separate,
unbuilt GitHub Actions entrypoint that would call `reviewPullRequest` the
same way `run-executor.ts` does, then write a `ci_runs` row). Nothing was
seeded to fake otherwise. Publishing a workflow that references `npx
devdigest review --pr` is honest scaffolding for that future runner, not a
claim it works end-to-end today.

## A note on risk (for whoever picks this up next)

"Publish to CI" opens a real pull request on a real repo when run against
the live `OctokitGitHubClient` with a configured `GITHUB_TOKEN`. That's the
user's action to take deliberately, in their own running app, against a repo
they control — not something to script, seed, or trigger from an agent/CI
context without the same care.
