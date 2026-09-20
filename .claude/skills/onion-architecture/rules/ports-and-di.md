# Ports, adapters, and the DI container

Alistair Cockburn's [Ports & Adapters](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software))
and Palermo's Onion Architecture describe the same mechanism: the inner ring
declares an interface (**port**) for a capability it needs; the outer ring
provides a concrete implementation (**adapter**). The inner ring never
imports the adapter — only the port.

## Where ports are declared here

Ports live in `server/src/vendor/shared/adapters.ts`: `GitHubClient`,
`GitClient`, `CodeIndex`, `Embedder`, `AuthProvider`, `SecretsProvider`,
`LLMProvider`. This file is vendored (`root AGENTS.md`: do not edit vendored
copies without checking the owning package) — treat it as the contract
boundary, not a place to bolt on one-off types for a single module.

A module's own `repository.ts` is *not* in that shared file, but it plays the
same role relative to `service.ts`: `service.ts` calls
`this.repo.findByFullName(...)`, not raw Drizzle — the repository class is a
narrow, module-scoped port even though its interface isn't formally extracted.

## Where adapters are implemented

`server/src/adapters/*` — one real class per port, e.g. `OctokitGitHubClient
implements GitHubClient`, `SimpleGitClient implements GitClient`,
`OpenAIProvider implements LLMProvider`. Each real adapter has a matching
mock in `server/src/adapters/mocks.ts` (`MockGitHubClient`, `MockGitClient`,
`MockLLMProvider`, …) implementing the *same* port interface — that's what
makes them swappable without touching `service.ts`.

## The composition root: `platform/container.ts`

`Container` is the only file in the codebase that's allowed to `new` a
concrete adapter class. Everything else asks `Container` for the port:

```ts
// container.ts — composition root: knows about BOTH the port and the concrete class
get git(): GitClient {
  if (this.overrides.git) return this.overrides.git;
  this._git ??= new SimpleGitClient(this.config.cloneDir);
  return this._git;
}
```

```ts
// service.ts — ring 1: only ever sees the port type `GitClient`
const { path } = await this.container.git.clone({ owner, name }, cloneUrl, { depth });
```

Two things worth copying when you add a new adapter:
- **Lazy construction** (`this._git ??= new SimpleGitClient(...)`) — don't
  build a client until something asks for it, so a missing secret doesn't
  crash app boot.
- **`ContainerOverrides`** — every port has an optional override slot so
  tests inject a mock without touching `service.ts` or `container.ts` logic,
  just the constructor argument. Add your new port to `ContainerOverrides`
  the same way `secrets?`, `git?`, `embedder?` are declared.

## Repository-as-port, specifically for Drizzle

The Sentry piece on [Atomic Repositories in Clean Architecture and
TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/)
and the Microsoft Learn [infrastructure persistence layer
guide](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)
both make the same point regardless of stack: a repository class is the
infrastructure-side implementation of a persistence port, and swapping the
underlying store should only ever mean rewriting the repository, never the
service. In this repo that means: if `service.ts` ever needs to reach past
`this.repo.someMethod(...)` into `drizzle-orm` directly, that's a sign the
repository is missing a method — add the method, don't reach around it.
