# @devdigest/agent-runner

The **DevDigest CI runner** — a standalone CLI that runs a DevDigest review agent
inside a *target repository's own CI* (GitHub Actions), entirely outside this
repo's server, its DI graph, and its Postgres instance.

`src/index.ts` is `ncc`-bundled into a single self-contained ESM bundle,
committed as `bundle/runner.mjs` (with a `// devdigest-runner <version>` banner),
embedded as `.devdigest/runner.mjs` in the exported `devdigest/ci` PR, and
executed by the target repo's workflow as `node .devdigest/runner.mjs`.

## What it does

1. **Loads + validates** the manifest `.devdigest/agents/<DEVDIGEST_AGENT>.yaml`
   (the generated workflow runs one job per agent), memory from
   `.devdigest/memory.jsonl`,
   and skill bodies `.devdigest/skills/*.md` from the target repo's working tree
   (validated against `AgentManifest` before use).
2. **Resolves the PR context** (owner / repo / number / title / body / fork flag)
   from CI env vars + the `pull_request` event payload.
3. **Fetches the PR diff** via the GitHub REST API (native `fetch`, no octokit)
   and strips DevDigest's own exported files (`.devdigest/**`, the generated
   workflow) before parsing.
4. **Runs the exact same `reviewer-core` pipeline** a local studio review uses —
   `assemblePrompt` / `wrapUntrusted` / `completeStructured` / mandatory
   `groundFindings` gate — via `reviewPullRequest`, with an injected
   `OpenRouterProvider`.
5. **Computes a deterministic verdict** from the *grounded* findings + the
   manifest's `ci_fail_on` (`countBlockers` / `gateTriggered`), never from the
   model's self-reported verdict.
6. **Writes `devdigest-result.json`** (`CiResultArtifact`) — the artifact the
   studio ingests — then **posts** to the PR (`github_review` | `pr_comment` |
   `none`) and **exits non-zero iff** the gate triggered `REQUEST_CHANGES`.

All orchestration lives in `src/run.ts` (`runCi`), which takes every side effect
(fs, `fetch`, LLM provider, clock, diff retrieval) as an injectable dependency so
it can be unit-tested hermetically. `src/index.ts` only wires those to the real
world and maps the result onto `process.exitCode`.

## Requirements — sibling source packages

This package is **not fully self-contained on its own**. It consumes
`reviewer-core` and the shared Zod contracts **as raw TypeScript source** via
`tsconfig.json` path aliases (exactly like the server does — this is intended,
not a workaround; `reviewer-core` emits no JS). To typecheck, test, or build the
runner, these folders **must exist as siblings** in the expected layout:

```
<repo-root>/
├── agent-runner/                      # this package
│   └── tsconfig.json                  # declares the aliases below
├── reviewer-core/
│   └── src/index.ts                   # → @devdigest/reviewer-core
└── server/
    └── src/vendor/shared/
        └── index.ts                   # → @devdigest/shared
```

Path aliases declared in `agent-runner/tsconfig.json`:

| Alias | Resolves to |
|-------|-------------|
| `@devdigest/reviewer-core` | `../reviewer-core/src/index.ts` |
| `@devdigest/reviewer-core/*` | `../reviewer-core/src/*` |
| `@devdigest/shared` | `../server/src/vendor/shared/index.ts` |
| `@devdigest/shared/*` | `../server/src/vendor/shared/*` |

If you lift this module onto a fresh branch or repo, bring `reviewer-core/` and
`server/src/vendor/shared/` along (or re-point the aliases). `pnpm build` (`ncc`)
inlines both packages plus their transitive deps into the bundle, so the
**shipped bundle** has zero runtime imports from `node_modules/@devdigest/*` — the
sibling requirement is a **build/dev-time** requirement only.

## Commands

```bash
pnpm install        # install deps (yaml, zod + dev tooling)
pnpm typecheck      # tsc --noEmit -p tsconfig.json
pnpm test           # vitest run (hermetic; LLM stubbed, no network)
pnpm build          # ncc build → dist/index.js, then scripts/copy-bundle.mjs → bundle/runner.mjs
```

**Build caveat.** ncc must emit ESM and the file must ship as `.mjs` (a `.js`
file without a `"type": "module"` package would be parsed as CommonJS in the
target repo) — `scripts/copy-bundle.mjs` handles the rename. The build is
type-checked: a type error anywhere in `reviewer-core` or the shared contracts
fails `pnpm build` (and the CI drift check). Fix the type error rather than
building with ncc's `-t` (transpile-only) flag, which the drift check would
not reproduce.

`dist/` and `node_modules/` are git-ignored. `bundle/runner.mjs` is **committed** — the
studio ships it byte-for-byte; CI (`.github/workflows/agent-runner.yml`) fails when it
drifts from a fresh `pnpm build`. Regenerate and commit it after changing runner code.

## Runtime environment (set by the target repo's workflow)

The runner reads these directly from `process.env`. This is the **correct and
only** channel for secrets here: the bundle runs in someone else's CI, where
there is no `SecretsProvider` / DI graph to inject from (see `CLAUDE.md`).

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENROUTER_API_KEY` | yes | LLM credential → `OpenRouterProvider` |
| `GITHUB_TOKEN` | when `post_as` ≠ `none` | fetch the diff + post the review/comment |
| `GITHUB_REPOSITORY` | yes | `owner/name` of the target repo |
| `PR_NUMBER` | yes¹ | PR to review |
| `GITHUB_EVENT_PATH` | auto (GHA) | `pull_request` event payload (title/body/fork) |
| `DEVDIGEST_DIR` | no | override the `.devdigest` dir (default: `cwd/.devdigest`) |
| `DEVDIGEST_RESULT_PATH` | no | override artifact path (default: `cwd/devdigest-result.json`) |
| `DEVDIGEST_AGENT` | yes (generated workflow) | slug of the agent whose `.devdigest/agents/<slug>.yaml` to run |
| `GITHUB_RUN_ID` / `GITHUB_RUN_ATTEMPT` | auto (GHA) | recorded in the artifact |
| `DEVDIGEST_POST_AS` | no | override of the manifest's `post_as` (`github_review` \| `pr_comment` \| `none`) |

¹ Falls back to `pull_request.number` from the event payload if `PR_NUMBER` is unset.

## Result artifact

`devdigest-result.json` is uploaded as the Actions artifact
`devdigest-result-<slug>` (artifact names must be unique per workflow run, and
there is one job per agent). The studio re-validates it with the strict
`CiResultArtifact` schema. Fields: `schema_version`, `findings_count`,
`critical`, `warning`, `suggestion`, `blockers`, `gate_triggered`, `verdict`,
`cost_usd`, `duration_ms`, `model`, `agent`, `agent_slug`, `version` (runner),
`manifest_version`, `pr_number`, `repository`, `repository_id`, `commit_sha`,
`run_id`, `run_attempt`, and `dependencies`. Identity fields (`commit_sha`,
`repository_id`, `run_id`, `agent_slug`) are checked against GitHub by the
server before anything is stored.

Secrets are never logged and never written to `devdigest-result.json` or any
posted comment.

## Exit codes

- `0` — review completed; the deterministic gate did **not** request changes.
- `1` — gate triggered `REQUEST_CHANGES`, **or** a hard failure anywhere in the
  pipeline (invalid manifest, missing skill file, unresolvable CI context,
  diff-fetch error, or an LLM/model-call error). On hard failure the runner posts
  nothing and writes no artifact — a failure upstream of "we have a grounded
  review" produces **nothing**, never a synthetic review.

## Invariants (do not break)

Because this package embeds `reviewer-core`'s pipeline into an artifact that
leaves this repo, it must preserve every reviewer-core invariant:

- The `groundFindings()` gate is mandatory — never skip or make it conditional.
  An all-dropped result is a valid zero-finding APPROVE, not an error.
- `wrapUntrusted()` + `INJECTION_GUARD` must wrap the diff and PR body before they
  reach the prompt — reuse `assemblePrompt`; never hand-roll it.
- The posted verdict and exit code come from the **deterministic** gate against
  the manifest's `ci_fail_on`, never the model's self-reported verdict.

See `CLAUDE.md` for the full rationale and `insights/INSIGHTS.md` for gotchas.
