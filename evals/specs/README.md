# evals/specs — feature specs

Index of feature/behavior specs for `evals/` — "how X should work," written
before or alongside implementation. Not eval files; those live in
`../skills/<skill>/<skill>.eval.ts`.

| Spec | Feature |
|------|---------|
| [`skill-eval-harness.md`](./skill-eval-harness.md) | Code-level skill eval harness: `pnpm eval` runs `skills/<skill>/<skill>.eval.ts` files via `skillTask`, grades with `patternMatch` + an LLM judge whose evidence quotes are verified verbatim, red/green per case with non-zero exit, local only; first eval `onion-architecture` — **draft** (prerequisite: module docs by doc-writer) |
