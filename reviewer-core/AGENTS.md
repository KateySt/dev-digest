# reviewer-core/ — @devdigest/reviewer-core

Full picture: README.md (pipeline diagram, public API) — read it first.

## Stack

Pure TypeScript, no DB/GitHub/filesystem. The only side effect is an injected
`LLMProvider`. `build` is a type-check only — the server consumes this
package's TS source directly via a tsconfig path alias.

## Commands

`pnpm test` (vitest, hermetic, stubbed `LLMProvider`) · `pnpm typecheck`

## Where things live

- `src/review/` — orchestration (`run.ts`), prompt assembly
- `src/llm/` — `LLMProvider` interface + structured-output parsing (Zod →
  JSON Schema, parse-with-repair)
- `src/output/` — grounding gate (`groundFindings`) and scoring

## Non-default conventions

- Every finding **must** cite a real diff line or `groundFindings` drops it —
  never trust the model's self-reported score, it's recomputed from survivors.
- Prompt-injection defense is one shared rule (`INJECTION_GUARD` in
  `prompt.ts`), not keyword scanning — don't add denylists here.

## Gotchas

Read `INSIGHTS.md` before starting work here — treat entries as
high-confidence unless the current code contradicts them.

## Read when

- Adding a new prompt slot (skills/memory/specs) → read `docs/README.md`
- Changing grounding or scoring behavior → read `specs/README.md`
