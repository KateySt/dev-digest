# evals/specs — feature specs

Index of feature/behavior specs for `evals/` — "how X should work," written
before or alongside implementation. Not eval files; those live in
`../skills/<skill>/<skill>.eval.ts`.

| Spec | Feature |
|------|---------|
| [`skill-eval-harness.md`](./skill-eval-harness.md) | Code-level skill eval harness (SPEC-01, reconciled with the merged code 2026-10-07): `pnpm eval:skills` runs `skills/<skill>/<skill>.eval.ts` via vitest + `skillTask` on the Claude Agent SDK (subscription) or OpenRouter (`EVAL_BACKEND`); grades with a `grounding` gate + LLM judge whose PASS quotes must be verbatim; records to `results/`; static `eval:quality` gate; evals `onion-architecture` (to build) and `dependency-checker` — **draft** |
