# Building a new `src/modules/<name>/` the Onion way

`server/AGENTS.md` already fixes the filenames for a module:

> Each `src/modules/<name>/` uses fixed, role-based filenames — `routes.ts`,
> `service.ts`, `repository.ts`, `constants.ts`, `helpers.ts` — not
> domain-specific names.

This skill adds the *why*: that naming convention is an Onion Architecture
instance. Follow it on purpose, not by copy-pasting the last module.

## Worked example: `src/modules/repos/`

| File | Ring | Job | Must not do |
|---|---|---|---|
| `routes.ts` | 3 (transport) | Parse request, call `RepoService`, set status codes | Touch `RepoRepository`, branch on domain state |
| `service.ts` | 1 (application) | `RepoService`: add/list/refresh/remove, the `clone` job orchestration | Import `drizzle-orm`, `postgres`, or a concrete adapter class |
| `repository.ts` | 2 (infrastructure) | `RepoRepository`: every query against the `repos` table, always scoped by `workspaceId` | Contain business rules (dedupe logic, job enqueueing) |
| `constants.ts` | — | Literals (`CLONE_JOB_KIND`, `CLONE_DEPTH`, `GITHUB_TOKEN_SECRET`) | — |
| `helpers.ts` | — | Pure transforms (`parseRepoUrl`, `toRepoDto`) — no I/O | — |

Notice the shape of `RepoService`: it takes a `Container` in its constructor
and builds its own `RepoRepository` from `container.db`, but every other
capability (`container.git`, `container.jobs`, `container.secrets`) comes in
as an already-resolved port. That's the pattern to copy for a new module.

## Checklist for a new module

1. Add the port interface to `server/src/vendor/shared/adapters.ts` *first*
   if the module needs a new kind of external capability (don't invent a
   one-off interface inside the module).
2. Write `repository.ts` against Drizzle, scoped to the module's own
   table(s) — see `rules/ports-and-di.md` for why this file counts as
   ring 2, not ring 1.
3. Write `service.ts` against `Container` and the module's own
   `repository.ts`. No Fastify types, no Drizzle imports.
4. Write `routes.ts` last — it should be almost entirely request-shape code
   delegating to `service.ts`, matching `repos/routes.ts`.
5. Register the module in `src/modules/index.ts` (per root `AGENTS.md`).

## When the module needs true domain logic

If the module's core logic doesn't depend on `workspaceId`-scoped state or
any I/O — pure calculation/decision logic — consider whether it belongs in
`reviewer-core/` (ring 0) instead of the module's `service.ts` (ring 1). The
review/grounding/scoring split between `reviewer-core` and
`server/src/modules/reviews/` is the existing precedent: `reviewer-core` owns
the domain reasoning, `modules/reviews/service.ts` owns the orchestration
(loading diffs, calling the DB, calling `reviewer-core`).
