# e2e/ — @devdigest/e2e

Full picture: README.md (how flows run, agent-browser setup) — read it first.

## Stack

Deterministic browser e2e via agent-browser — no LLM in the loop. Journeys
are `*.flow.json` files in `specs/`.

## Commands

Needs the full stack running (client + API + seeded DB) — see README.md for
the exact runner invocation (`run.ts`).

## Where things live

- `specs/*.flow.json` — one flow per user journey, numbered by add order;
  see `specs/README.md` for the index
- `lib/` — flow runner helpers
- `run.ts` — entry point

## Non-default conventions

- Flows assume a freshly-seeded DB (`acme/payments-api`, PR #482 first) —
  don't hardcode assumptions beyond what the seed guarantees.
- Flows should stay order-independent where possible (see the comment in
  `specs/01-app-boot.flow.json`).

## Gotchas

Read `INSIGHTS.md` before starting work here — treat entries as
high-confidence unless the current code contradicts them.

## Read when

- Adding a new user journey → read `specs/README.md` first for the existing
  flow-file conventions, then `docs/README.md` for authoring tips
