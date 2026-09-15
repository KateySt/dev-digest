# DevDigest — repo map

Local-first AI PR-review tool, course starter template. Full picture: README.md
(architecture diagram, quick start) — read it first if you're new here.

## Modules (standalone packages, no workspace tool — see README for why)

- `server/` — Fastify API + Postgres/pgvector (`@devdigest/api`)
- `client/` — Next.js studio (`@devdigest/web`)
- `reviewer-core/` — pure review engine, diff → LLM → findings (`@devdigest/reviewer-core`)
- `e2e/` — deterministic browser e2e suite (`@devdigest/e2e`)

Each module has its own `CLAUDE.md` that Claude Code loads automatically once
you touch a file inside it. Don't duplicate module-level conventions here —
put them in the module's own `CLAUDE.md` instead.

## Commands (repo-wide)

- `./scripts/dev.sh` — one-shot: Postgres + migrate + seed + API + web
- `docker compose up -d` / `docker compose down` — Postgres only
- Per package: `pnpm dev` / `pnpm test` / `pnpm typecheck` (exact scripts in
  each module's README)

## Read when

- Touching test strategy or CI gating → read `TESTING.md`
- Writing or editing a built-in agent's system prompt → read `docs/agent-prompts/README.md`
- Working inside a specific module → read that module's `README.md` (its
  `CLAUDE.md` loads on its own)

## Non-default conventions

- No monorepo tool (pnpm workspaces, turborepo, nx). Cross-package code is
  shared via tsconfig `paths` aliases (`@devdigest/shared`,
  `@devdigest/reviewer-core`, `@devdigest/ui`) pointing at `src/vendor/*` —
  not published packages, not a workspace symlink.
- DB migrations never run on boot — always `pnpm db:migrate` by hand after
  pulling schema changes.

## Do-not-touch

- `server/src/vendor/shared`, `client/src/vendor/shared`, `client/src/vendor/ui`
  — vendored copies. Check the owning package before editing.
