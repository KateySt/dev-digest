# The dependency rule

> "Draw all coupling arrows toward the center." — Jeffrey Palermo, [The Onion
> Architecture: part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)

Every other rule in this skill is a restatement of one thing: **an import
may only point from an outer ring to an inner ring, never the reverse.**
Onion, Hexagonal, and Clean Architecture are the same idea wearing different
names — see Milan Jovanović's [comparison](https://milanjovanovic.tech/blog/clean-architecture-vs-onion-vs-hexagonal)
— and the idea is the Dependency Inversion Principle applied at the
package/module level, not just the class level.

## The check

For any file you're adding or editing, ask: **does this file import something
that knows about Fastify, Drizzle, Postgres, Octokit, or a concrete adapter
class?**

- If it's `reviewer-core/src/**` → answer must be no. This package has no
  DB/GitHub/filesystem dependency at all — its only side effect is an
  injected `LLMProvider` (see `reviewer-core/AGENTS.md`). That's ring 0.
- If it's `server/src/modules/<name>/service.ts` → it may import
  `Container`'s *type* and the port interfaces from
  `server/src/vendor/shared/adapters.ts` (`GitClient`, `GitHubClient`,
  `LLMProvider`, `SecretsProvider`, …). It must **not** import
  `drizzle-orm`, `postgres`, `octokit`, or a concrete class from
  `server/src/adapters/*` — those come in through `Container`, already
  resolved to an interface.
- If it's `server/src/modules/<name>/repository.ts` → it's allowed to import
  Drizzle and the schema (`server/src/db/schema.ts`). It's the outermost
  edge of the *persistence* port, so this is where SQL is supposed to live.
- If it's `server/src/modules/<name>/routes.ts` → it may import Fastify,
  zod schemas, and its own module's `service.ts`. It must **not** import
  `repository.ts` directly, and it must not contain business logic (branching
  on domain state, computing derived values) — that belongs in `service.ts`.
- If it's `server/src/platform/container.ts` → this is the composition root.
  It's the *only* file allowed to `new` a concrete adapter class
  (`OctokitGitHubClient`, `SimpleGitClient`, `OpenAIProvider`, …) and hand it
  out through a typed interface getter. Every other file receives adapters
  already resolved through `Container`.

## Why this matters here specifically

`server/AGENTS.md` already documents two conventions that are dependency-rule
violations if broken:
- "Routes validate `params`/`body` with zod schemas — never hand-roll
  `Schema.parse(req.body)` in a handler" (business logic leaking into ring 3).
- "Secrets never go through `AppConfig` — always through `SecretsProvider`"
  (ring 1/2 code must depend on the port, not reach for a ring-3 config
  object as a shortcut).

Treat both as instances of the same underlying rule, not separate rules to
memorize.

## Fast litmus test

If deleting Fastify, Drizzle, and every file under `server/src/adapters/`
would still leave a `service.ts` compiling (against its port interfaces, with
mocks swapped in), the dependency rule holds. `reviewer-core`'s test suite —
hermetic, stubbed `LLMProvider`, no network — is what this looks like when
it's done right.
