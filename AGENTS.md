# DevDigest — repo map

Local-first AI PR-review tool, course starter template. Full picture: README.md
(architecture diagram, quick start) — read it first if you're new here.

## Modules (standalone packages, no workspace tool — see README for why)

- `server/` — Fastify API + Postgres/pgvector (`@devdigest/api`)
- `client/` — Next.js studio (`@devdigest/web`)
- `reviewer-core/` — pure review engine, diff → LLM → findings (`@devdigest/reviewer-core`)
- `e2e/` — deterministic browser e2e suite (`@devdigest/e2e`)
- `desktop/` — Electron app for Windows/macOS (`@devdigest/desktop`); released
  by `.github/workflows/release.yml` on `v*` tags
- `agent-runner/` — CLI that runs a review agent inside a target repo's own CI
  (`@devdigest/agent-runner`); `bundle/runner.mjs` is committed on purpose —
  rebuild it with `pnpm build`, never hand-edit
- `mcp-server/` — stdio MCP server exposing review tools to Claude Code, a thin
  HTTP client over the API on :3001 (`@devdigest/mcp-server`)
- `evals/` — vitest + Claude Agent SDK evals for `.claude/skills`, `.claude/agents`
  and workflow behaviour (`@devdigest/evals`); `**/fixtures/**` is intentionally bad code

Each module has its own `AGENTS.md` that Claude Code loads automatically once
you touch a file inside it. Don't duplicate module-level conventions here —
put them in the module's own `AGENTS.md` instead.

## Commands (repo-wide)

- `./scripts/dev.sh` — one-shot: Postgres + migrate + seed + API + web
- `docker compose up -d` / `docker compose down` — Postgres only
- Per package: `pnpm dev` / `pnpm test` / `pnpm typecheck` (exact scripts in
  each module's README)
- Repo root (tooling only — `pnpm install` once at the root):
  - `pnpm lint` / `pnpm lint:fix` — Biome linter over every module (`biome.jsonc`).
    Formatter is off on purpose: modules use different quote styles.
  - `pnpm knip` — unused files / exports / deps across all modules (`knip.jsonc`);
    needs each module's `node_modules` installed, so it is local-only, not in CI.
- Versions: Node 22 (`.nvmrc`), pnpm pinned via `packageManager` in every
  `package.json` (corepack). Dependabot opens weekly grouped PRs (`.github/dependabot.yml`).

## Read when

- Touching test strategy or CI gating → read `TESTING.md`
- Writing or editing a built-in agent's system prompt → read `docs/agent-prompts/README.md`
- Working inside a specific module → read that module's `README.md` (its
  `AGENTS.md` loads on its own)

## Non-default conventions

- Agent instructions live in `AGENTS.md` (this file and one per module).
  `CLAUDE.md` next to each is a one-line `@AGENTS.md` import so Claude Code
  loads the same content — edit `AGENTS.md`, never `CLAUDE.md` directly.
- No monorepo tool (pnpm workspaces, turborepo, nx). Cross-package code is
  shared via tsconfig `paths` aliases (`@devdigest/shared`,
  `@devdigest/reviewer-core`) pointing at `src/vendor/*` —
  not published packages, not a workspace symlink.
- DB migrations never run on boot — always `pnpm db:migrate` by hand after
  pulling schema changes.

## Naming conventions

- Commit messages follow Conventional Commits with a scope: `feat(reviews):
  …`, `fix(db): …`, `docs(insights): …`, `chore: …`. Match the existing scope
  for the module you're touching (`reviews`, `db`, `conventions`, `dev`, …).

## Do-not-touch

- `server/src/vendor/shared`, `client/src/vendor/shared` — vendored copies.
  Check the owning package before editing.
- Lock files (`package-lock.json`, `pnpm-lock.yaml`) in any module — generated
  by the package manager, never hand-edit; regenerate via `pnpm install`.
  `reviewer-core/` and `e2e/` CI installs use `npm ci`, so their
  `package-lock.json` is live; every other module is pnpm-only.
- Lint suppressions: `// biome-ignore lint/<group>/<rule>: <reason>` placed
  above the statement — there is no ESLint here, so `eslint-disable` does nothing.
