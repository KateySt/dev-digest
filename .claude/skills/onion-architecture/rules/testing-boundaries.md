# Testing boundaries follow the rings

The Onion Architecture's payoff is testability: swap the outer ring for a
fake and the inner ring tests fast, deterministically, with no network or DB.
This repo already has the convention — this rule file just names it.

## Ring 0 — domain: hermetic, no I/O

`reviewer-core`'s test suite (`reviewer-core/AGENTS.md`) stubs the one thing
that has a side effect, `LLMProvider`, and runs everything else in-process.
This is the model for testing pure domain logic: no testcontainers, no
network, no filesystem.

## Ring 1 — application services: mock the ports

Test a `service.ts` by constructing (or partially mocking) a `Container` with
`ContainerOverrides` and injecting `adapters/mocks.ts` classes
(`MockGitClient`, `MockGitHubClient`, `MockLLMProvider`, `MockSecretsProvider`,
`MockAuthProvider`, `MockEmbedder`, `MockCodeIndex`). These mocks return
deterministic fixtures and record calls (`MockGitHubClient.posted`,
`MockGitClient.cloned`) so assertions can check *what the service asked the
port to do*, not what a real API returned.

Do **not** stand up testcontainers Postgres just to test `service.ts` logic
that doesn't depend on real SQL semantics (constraints, transactions,
concurrent writes) — that's what ring-2 tests are for.

## Ring 2 — infrastructure: `*.it.test.ts` only

`server/AGENTS.md`: "A DB-backed test **must** be named `*.it.test.ts`
(testcontainers Postgres) or the unit/integration split breaks." This is the
dependency rule applied to the test suite itself: a file that talks to real
Postgres is ring-2 code, and ring-2 tests are integration tests by
definition. Use these to verify `repository.ts` queries — tenancy scoping
(`workspaceId` filters), constraint behavior, migrations — not to re-test
`service.ts` orchestration that a mock already covers.

## Quick decision rule

- Testing a use case, a branch, an orchestration order → mock the ports,
  plain `*.test.ts`.
- Testing a SQL query, a constraint, an index, a migration → real Postgres,
  `*.it.test.ts`.
- Testing prompt assembly, grounding, or scoring → `reviewer-core`, stub
  `LLMProvider`, no DB at all.

If a test needs both a mock and testcontainers to pass, that's usually a
signal the code under test is straddling two rings and should be split.
