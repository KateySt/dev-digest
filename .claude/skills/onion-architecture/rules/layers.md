# The four rings, in this codebase

Onion Architecture is usually drawn as four concentric circles: Domain Model,
Domain Services, Application Services, and Infrastructure (see the
[NDepend overview](https://blog.ndepend.com/onion-architecture-layers/) or
[Expedia's write-up](https://medium.com/expedia-group-tech/onion-architecture-deed8a554423)
for the generic version). This file skips the generic version and maps the
rings directly onto what already exists in this repo.

## Ring 0 — Domain: `reviewer-core/`

Pure TypeScript. No DB, no GitHub, no filesystem. The **only** side effect
allowed in this package is calling an injected `LLMProvider`
(`reviewer-core/AGENTS.md`). This is the in-repo reference example of what a
ring-0 package looks like — hold every other "is this domain logic?"
question up against it.

- `src/review/` — orchestration (`run.ts`), prompt assembly
- `src/llm/` — the `LLMProvider` port + structured-output parsing
- `src/output/` — grounding (`groundFindings`) and scoring

If you're adding review/grounding/scoring logic that doesn't need Fastify,
Drizzle, or a live network call, it probably belongs here, not in
`server/src/modules/reviews/`.

## Ring 1 — Application services: `server/src/modules/<name>/service.ts`

Use-case orchestration: what happens, in what order, under what conditions.
Depends on:
- Port interfaces from `server/src/vendor/shared/adapters.ts` (`GitClient`,
  `SecretsProvider`, `LLMProvider`, …), accessed through `Container`
- Its own module's `repository.ts` (also treated as a port from the
  service's point of view)
- Pure helpers/constants from its own module

Example: `server/src/modules/repos/service.ts`'s `RepoService.add()` parses a
URL, checks for a dupe via `this.repo.findByFullName(...)`, persists, and
enqueues a job — all use-case logic, zero SQL, zero HTTP status codes.

## Ring 2 — Ports & infrastructure

**Ports** (interfaces) live in `server/src/vendor/shared/adapters.ts` —
`GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `AuthProvider`,
`SecretsProvider`, `LLMProvider`. These are owned by the layer that
*consumes* them (ring 1), not by the adapters that implement them.

**Infrastructure** (concrete implementations) live in two places:
- `server/src/adapters/*` — `OctokitGitHubClient`, `SimpleGitClient`,
  `RipgrepCodeIndex`, `OpenAIProvider`/`AnthropicProvider`, `OpenAIEmbedder`,
  `LocalSecretsProvider`, `LocalNoAuthProvider` — one real implementation and
  one mock (`adapters/mocks.ts`) per port.
- `server/src/modules/<name>/repository.ts` — the Drizzle/Postgres access
  for that module's tables. `repos/repository.ts`'s docstring says it best:
  "the ONLY place that touches the `repos` table."

## Ring 3 — Composition & transport

- `server/src/platform/container.ts` — the composition root. Constructs
  concrete adapters lazily (see the `get git()`, `get codeIndex()` getters),
  accepts `ContainerOverrides` for tests, and is the only file that imports
  both a port interface *and* its concrete implementation in the same
  statement.
- `server/src/modules/<name>/routes.ts` — Fastify plugin: request/response
  shape, status codes, zod validation, delegates everything else to
  `service.ts`. `repos/routes.ts` is the reference shape: every handler is
  2-4 lines that call into `RepoService`.

## Picture

```
routes.ts (ring 3, Fastify)
    ↓ calls
service.ts (ring 1, use cases)
    ↓ calls, via port interfaces
repository.ts / adapters/* (ring 2, Drizzle + external clients)
    ↑ wired together by
platform/container.ts (ring 3, composition root)

reviewer-core/ (ring 0) — imported by server's service layer,
never the other way around.
```
