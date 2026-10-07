# Spec: Code-level skill eval harness (`evals/`)
Spec ID: SPEC-01
Status: draft
Supersedes: none

Prerequisite: `evals/` is a new top-level module. Its architecture/module
documentation (purpose, place in the repo map, dependency on `reviewer-core`
via the tsconfig `paths` alias convention, local-only status) is written
separately by doc-writer in `docs/` and the root module list. This spec covers
only the harness's behavior and assumes that documentation exists.

Related: the in-app skill harness ([`../../server/specs/skill-evals.md`](../../server/specs/skill-evals.md), SPEC-08) — a different tool. The in-app harness keeps "no model call in the scorer"; this package deliberately uses an LLM judge.

## Changelog
- 2026-10-06 — Resolved open questions: judge skipped when a `patternMatch` check fails (AC-6, AC-7); task and judge models from `EVAL_TASK_MODEL` / `EVAL_JUDGE_MODEL` with harness-config defaults (AC-14). ACs renumbered.
- 2026-10-06 — initial version

## Problem and user
A developer who writes a Claude Code skill (`.claude/skills/<skill>/SKILL.md`)
has no repeatable way to check that the skill still makes a model do what it
promises. Breaking the skill's text should turn a local eval red, and
reverting it should turn it green again. The first skill covered is
`onion-architecture`.

## Goals / Non-goals
Goals
- `pnpm eval` inside `evals/` runs every skill eval file and reports red/green per case.
- Each skill eval lives at `skills/<skill>/<skill>.eval.ts` and declares its cases through `skillTask`.
- Grading is `patternMatch` for concrete facts, plus an LLM judge that grades against listed practices and must quote evidence from the output.
- First eval: `onion-architecture`, 3–4 cases.

Non-goals
- Not run in CI (local / manual only — needs real keys and costs money).
- No retries and no multi-sample voting; one attempt per case at temperature 0.
- No reporting into the DevDigest database or studio UI.
- No evals for DevDigest DB-stored review skills (those use the in-app harness, SPEC-08).

## User stories
- As a skill author, I deliberately weaken `onion-architecture/SKILL.md`, run `pnpm eval`, see a case go red with the failing check named, revert, and see it green.

## Acceptance criteria (EARS)
- AC-1: WHEN `pnpm eval` runs in `evals/`, the harness shall discover and run every `skills/<skill>/<skill>.eval.ts` file. (verify via: integration test)
- AC-2: WHEN a `skillTask` case runs, the harness shall read the skill text from `.claude/skills/<skill>/SKILL.md` in the repo at run time, not from a copy. (verify via: unit test)
- AC-3: IF the skill's `SKILL.md` does not exist, THEN the harness shall fail that eval with a message naming the missing path. (verify via: unit test)
- AC-4: WHEN a `skillTask` case runs, the harness shall send the skill text as instructions and the case input (code or diff fixture) as delimited data to the configured task model at temperature 0, exactly once, and collect the text output. (verify via: unit test)
- AC-5: WHEN grading a case, the harness shall evaluate every `patternMatch` check deterministically against the task output. (verify via: unit test)
- AC-6: WHEN every `patternMatch` check of a case passes, the harness shall call the configured judge model, separate from the task model, with the case's practices and the task output as delimited data, and receive for each practice a 0/1 verdict with evidence quotes. (verify via: unit test)
- AC-7: IF any `patternMatch` check of a case fails, THEN the harness shall mark the case failed and skip the judge call. (verify via: unit test)
- AC-8: IF any evidence quote for a practice does not appear verbatim in the task output, THEN the harness shall treat that practice as failed and report the fabricated quote. (verify via: unit test)
- AC-9: WHEN all `patternMatch` checks pass and every practice is judged 1 with verified quotes, the harness shall mark the case passed; otherwise failed. (verify via: unit test)
- AC-10: IF a task or judge model call errors, THEN the harness shall mark that case failed with the error, with no retry. (verify via: unit test)
- AC-11: WHEN a run finishes, the harness shall print one green or red line per case, and for each red case the failed checks, the judge's reason, or the error. (verify via: unit test)
- AC-12: WHEN any case failed, the harness shall exit with a non-zero code; WHEN all passed, with zero. (verify via: integration test)
- AC-13: IF `OPENROUTER_API_KEY` is not set, THEN the harness shall exit non-zero with a message naming the variable before making any model call. (verify via: unit test)
- AC-14: WHEN the harness starts, it shall use the task model from `EVAL_TASK_MODEL` and the judge model from `EVAL_JUDGE_MODEL`, falling back to the defaults in the harness config when a variable is unset. (verify via: unit test)
- AC-15: WHEN the `onion-architecture` eval runs, it shall contain 3–4 cases declared via `skillTask`. (verify via: manual check)
- AC-16: WHEN `onion-architecture/SKILL.md` is deliberately broken, `pnpm eval` shall report at least one red case; WHEN the change is reverted, all its cases shall be green again. (verify via: manual check)

## Edge cases
- Model output that contains text resembling instructions to the judge is still graded as data (see Untrusted inputs).
- Judge returns malformed output (not parseable into per-practice verdicts): the case fails with that reason (AC-10 path).

## Non-functional requirements
- Determinism as far as the provider allows: temperature 0, single attempt; `patternMatch` and quote verification are pure code.
- Secrets: the API key comes only from the `OPENROUTER_API_KEY` environment variable and is never printed.
- Configuration: task and judge model ids come from `EVAL_TASK_MODEL` / `EVAL_JUDGE_MODEL`, with defaults in the harness config.
- Reuse: the model provider is `reviewer-core`'s OpenRouter provider, imported via the tsconfig `paths` alias convention (no published package, no workspace symlink).

## Inputs and provenance
- [reused: repo file] `.claude/skills/<skill>/SKILL.md` — the skill text under test.
- [deterministic: fixtures] case inputs (code / diff snippets), `patternMatch` checks, practice lists — authored in the eval file.
- [new: 1 LLM call per case] task model run.
- [new: 1 LLM call per case] judge model run.
- [deterministic: harness] pattern checks, quote verification, pass/fail, exit code.

## Untrusted inputs
- Case inputs reach the task model only as clearly delimited data, never as instructions.
- The task model's output reaches the judge only as clearly delimited data, so text inside it cannot instruct the judge.
- Judge evidence quotes are not trusted: each is verified verbatim against the output (AC-8).

## Module interactions / API contracts
- `reviewer-core`: OpenRouter provider (`OpenRouterProvider`) used for both task and judge calls via the `paths` alias.
- Reads `.claude/skills/<skill>/SKILL.md` from the repo root; writes nothing.
- No calls to `server/` or `client/`.

## Open questions
None — all resolved 2026-10-06.
