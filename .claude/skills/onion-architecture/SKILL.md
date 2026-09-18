---
name: onion-architecture
description: "Forces Onion Architecture (dependency rule, ports & adapters, layer isolation) for DevDigest's backend modules (server/, reviewer-core/). Use when adding a new Fastify module, a new adapter/port, a new repository, or when reviewing backend code for layering violations — e.g. business logic in routes.ts, services importing concrete adapters instead of interfaces, or domain code touching Drizzle/Postgres directly. Trigger terms: onion architecture, layered architecture, ports and adapters, dependency rule, domain layer, application service, DI container, repository pattern."
metadata:
  tags: architecture, ddd, onion, hexagonal, backend, fastify, di
---

## When to use

Use this skill when you:
- Add a new Fastify module under `server/src/modules/<name>/`
- Add a new port/adapter under `server/src/adapters/`
- Touch `server/src/platform/container.ts` (the composition root)
- Work anywhere in `reviewer-core/` (the project's one pure-domain package)
- Review backend code for layering violations (business logic in routes,
  services depending on concrete infrastructure, domain code touching
  Drizzle/Postgres directly)

Not in scope: `client/` (Next.js) and `e2e/` — this skill governs backend
modules only.

**Ordering with other skills**: pick module/layer boundaries with this skill
first, then implement each ring's file with the framework-specific skill —
`fastify-best-practices` for `routes.ts`, `drizzle-orm-patterns` for
`repository.ts`. This skill decides *where code is allowed to live and what
it's allowed to import*; the others decide *how to write that file well*.

## The one rule

**Dependencies point inward, only.** An outer ring may import an inner ring.
An inner ring must never import an outer ring. If you're unsure which ring a
file belongs to, ask: "does this file know about Fastify, Drizzle, or
Postgres?" If yes, it's an outer ring. See `rules/dependency-rule.md`.

## The four rings, mapped onto this repo

| Ring | What it is | Where it lives here |
|---|---|---|
| 0 — Domain | Business rules, zero framework/infra knowledge | `reviewer-core/src/` |
| 1 — Application services | Use-case orchestration, depends on port interfaces only | `server/src/modules/<name>/service.ts` |
| 2 — Ports & infrastructure | Interfaces + their concrete implementations (DB, HTTP clients, LLMs) | `server/src/vendor/shared/adapters.ts` (ports) + `server/src/adapters/*` and `server/src/modules/<name>/repository.ts` (implementations) |
| 3 — Composition / transport | Wires concrete adapters into services, exposes them over HTTP | `server/src/platform/container.ts` + `server/src/modules/<name>/routes.ts` |

Full detail and reasoning: `rules/layers.md`.

## How to use

Read the rule file for the layer you're touching:

- [rules/dependency-rule.md](rules/dependency-rule.md) — the inward-only rule, how to check it, why it exists
- [rules/layers.md](rules/layers.md) — the four rings mapped onto `server/` and `reviewer-core/`
- [rules/module-anatomy.md](rules/module-anatomy.md) — building a new `src/modules/<name>/` the Onion way
- [rules/ports-and-di.md](rules/ports-and-di.md) — defining ports, wiring adapters through the DI container
- [rules/testing-boundaries.md](rules/testing-boundaries.md) — what to mock vs. what to hit for real, per ring
- [rules/anti-patterns.md](rules/anti-patterns.md) — concrete violations to flag in review, phrased against this codebase
- [rules/enforcement.md](rules/enforcement.md) — optional `dependency-cruiser` config to make the rule machine-checkable

## Further reading

- Jeffrey Palermo, *The Onion Architecture* (original 2008 series) — [part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/), [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/), [part 3](https://jeffreypalermo.com/blog/the-onion-architecture-part-3/)
- Milan Jovanović, [Clean vs Onion vs Hexagonal Architecture](https://milanjovanovic.tech/blog/clean-architecture-vs-onion-vs-hexagonal)
- NDepend Blog, [Onion Architecture: Going Beyond Layers](https://blog.ndepend.com/onion-architecture-layers/)
- Ritesh Kapoor (Expedia Group Tech), [Onion Architecture. Let's slice it like a Pro](https://medium.com/expedia-group-tech/onion-architecture-deed8a554423)
- André Bazaglia, [Clean architecture with TypeScript: DDD, Onion](https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/)
- remojansen (dev.to), [Enforce Clean Architecture in your TypeScript projects with fresh-onion](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi)
- Sentry Blog, [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/)
- Microsoft Learn, [Designing the infrastructure persistence layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design) (framework-agnostic repository/port framing)
- Wikipedia, [Hexagonal architecture (software)](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)) — Ports & Adapters terminology, used interchangeably with Onion in this skill
