# Anti-patterns to flag in review

Concrete, codebase-specific violations of the dependency rule
(`rules/dependency-rule.md`). Each one is phrased as "if you see X, it's a
layering violation, here's the fix" — not abstract theory.

## 1. `routes.ts` calling the database directly

```ts
// BAD — routes.ts reaching past service.ts into persistence
app.get('/repos', async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return app.container.db.select().from(repos).where(eq(repos.workspaceId, workspaceId));
});
```

Fix: route calls `service.list(workspaceId)`; the query lives in
`RepoRepository.list`. Compare against the real `repos/routes.ts`, where
every handler is a 2-4 line delegation to `RepoService`.

## 2. `service.ts` importing a concrete adapter instead of its port

```ts
// BAD — service.ts importing the concrete class
import { OpenAIEmbedder } from '../../adapters/embedder/openai.js';
```

Fix: depend on `Embedder` (the port, from `vendor/shared/adapters.ts`) via
`this.container.embedder`. The concrete class is only ever named inside
`platform/container.ts`.

## 3. Domain reasoning leaking out of `reviewer-core`

If new code under `server/src/modules/reviews/` starts computing scores,
grounding findings, or deciding what counts as a valid citation — logic that
doesn't need a DB row or an HTTP request — that's ring-0 logic living in
ring 1. Fix: push it into `reviewer-core/src/output/` and have
`modules/reviews/service.ts` call it, the same way it already calls into
`reviewer-core` for the LLM review pass.

## 4. Business logic in `repository.ts`

```ts
// BAD — repository.ts deciding whether a clone should be re-triggered
async refreshIfStale(id: string): Promise<void> {
  const row = await this.getById(id);
  if (row && Date.now() - row.lastPolledAt.getTime() > ONE_DAY) {
    await this.enqueueClone(row); // repository shouldn't know about jobs
  }
}
```

Fix: `repository.ts` exposes data access only (`getById`, `updateClonePath`);
the staleness decision and the `jobs.enqueue(...)` call belong in
`service.ts`, which already has access to `Container.jobs`.

## 5. Reaching for `AppConfig` instead of `SecretsProvider`

Already flagged in `server/AGENTS.md` as a non-default convention; it's
also a dependency-rule violation, because `AppConfig` is composition-root
state and secrets access is a port (`SecretsProvider`) that ring-1 code
should depend on abstractly.

## 6. A new one-off interface instead of extending the shared port

If a module needs a new external capability, adding a bespoke interface
inside `modules/<name>/service.ts` (instead of extending
`vendor/shared/adapters.ts` and wiring a real+mock adapter pair) fragments
the port surface and breaks the "one mock per port" testing convention in
`rules/testing-boundaries.md`.

## 7. Skipping the mock, hitting the network in a unit test

A `*.test.ts` (not `*.it.test.ts`) that calls a real `OctokitGitHubClient` or
makes a live LLM request is a ring-1 test that accidentally became a ring-2
test. Fix: inject the matching class from `adapters/mocks.ts` through
`ContainerOverrides`.
