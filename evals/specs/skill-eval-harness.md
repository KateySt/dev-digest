# Spec: Code-level skill eval harness (`evals/`)
Spec ID: SPEC-01
Status: draft
Supersedes: none

Scope: the **skill (content) tier** of the `evals/` package — `skillTask`, the
two scorers, the runners/backends they share, the static `eval:quality` gate,
and the per-skill evals (`onion-architecture`, `dependency-checker`). The agent
(`agentTask`) and workflow (`workflowTask`) tiers, `eval:repeat` / `eval:delta`
/ `eval:benchmark` statistics, and the LiteLLM proxy are documented in
[`../README.md`](../README.md) and are not specified here beyond what the skill
tier depends on.

Related: the in-app skill harness ([`../../server/specs/skill-evals.md`](../../server/specs/skill-evals.md), SPEC-08) — a different tool. The in-app harness keeps "no model call in the scorer"; this package deliberately uses an LLM judge.

## Changelog
- 2026-10-07 — Reconciled with the merged course-template code in `evals/` (code is the source of truth, user decision S1 in `docs/plans/2026-10-07-unfinished-features-and-critical-bugs.md`). The original draft assumed an OpenRouter-only harness reusing `reviewer-core`'s provider; the merged package instead runs on the Claude Agent SDK (subscription) by default with an optional direct OpenRouter backend, does not import `reviewer-core`, uses `EVAL_MODEL` (not `EVAL_TASK_MODEL`), requires `OPENROUTER_API_KEY` only under `EVAL_BACKEND=openrouter`, gates the judge with a `grounding` substring list, passes a case on a judge score threshold (not "every practice passed"), and reports/exits via vitest. AC ids kept stable: AC-1..AC-7 and AC-9..AC-14 reworded in place to the merged behavior; AC-8 (verbatim-evidence check), AC-15/AC-16 (onion-architecture eval) kept as still-to-build; AC-17..AC-24 added (backends, baseline mode, records, static gate, dependency-checker eval). Non-goals updated (no temperature control on the SDK backend, transport-level retries exist on the OpenRouter client).
- 2026-10-06 — Resolved open questions: judge skipped when a `patternMatch` check fails (AC-6, AC-7); task and judge models from `EVAL_TASK_MODEL` / `EVAL_JUDGE_MODEL` with harness-config defaults (AC-14). ACs renumbered.
- 2026-10-06 — initial version

## Problem and user
A developer who writes a Claude Code skill (`.claude/skills/<skill>/SKILL.md`)
has no repeatable way to check that the skill still makes a model do what it
promises. Breaking the skill's text should turn a local eval red, and
reverting it should turn it green again.

## Goals / Non-goals
Goals
- `pnpm eval:skills` (and `pnpm eval`) inside `evals/` runs every skill eval file through vitest and reports pass/fail per case.
- Each skill eval lives at `skills/<skill>/<skill>.eval.ts` (thin: `describeSkill` + `runSkillCases`) with its data in `<skill>.cases.ts` and raw inputs in `fixtures/`.
- Grading is a deterministic `grounding` substring gate (`patternMatch`) plus an LLM judge that grades binary PASS/FAIL per practice and must quote verbatim evidence from the output.
- Runs on the Claude Code subscription by default (no per-token billing); the same cases run on OpenRouter by env vars only.
- Skill evals: `onion-architecture` (3–4 cases) and `dependency-checker` (3 cases, already authored).

Non-goals
- No CI workflow for evals in this repo (README documents how to wire one; adding it is a separate change).
- No temperature control on the default (Agent SDK) backend; temperature 0 applies only to the direct OpenRouter backend.
- No harness-level retries or multi-sample voting per case (the OpenRouter HTTP client's own transport retries are not counted as harness retries); multi-run stability is `eval:repeat`'s job.
- No import of `reviewer-core` — the OpenRouter runtime mirrors its pattern but is self-contained inside `evals/`.
- No reporting into the DevDigest database or studio UI.
- No evals for DevDigest DB-stored review skills (those use the in-app harness, SPEC-08).

## User stories
- As a skill author, I deliberately weaken `onion-architecture/SKILL.md`, run `pnpm vitest run skills/onion-architecture`, see a case go red with the failing check named, revert, and see it green.

## Acceptance criteria (EARS)
- AC-1: WHEN `pnpm eval:skills` runs in `evals/`, the harness shall discover and run every `skills/<skill>/<skill>.eval.ts` file via vitest (and `pnpm eval` shall run every `**/*.eval.ts` plus `src/**/*.test.ts`). (verify via: manual check)
- AC-2: WHEN a `skillTask` case runs in the candidate configuration, the harness shall read `.claude/skills/<skill>/SKILL.md` plus every `references/*.md` of that skill (sorted) from the repo at run time, not from a copy. (verify via: unit test)
- AC-3: IF the skill's `SKILL.md` does not exist, THEN the harness shall fail that case with an error naming the missing path (`SKILL.md not found: <path>`). (verify via: unit test)
- AC-4: WHEN a `skillTask` case runs, the harness shall send the skill content as the system prompt and the case `prompt` (with its fixtures inlined) as the user prompt to the task model exactly once, with no tools and no on-disk config loaded, and collect the text output. (verify via: unit test)
- AC-5: WHEN a case declares `grounding` substrings, the harness shall score them deterministically as the case-insensitive fraction present in the task output (an empty list scores 1). (verify via: unit test)
- AC-6: WHEN a case declares `practices` and its grounding score is 1 or it has no grounding, the harness shall call the judge model (`EVAL_JUDGE_MODEL`, separate from the task model) once with the practices and the task output, and parse a binary PASS/FAIL with an evidence quote per practice. (verify via: unit test)
- AC-7: IF a case's grounding score is below 1, THEN the harness shall fail the case and skip the judge call. (verify via: unit test)
- AC-8: IF the judge marks a practice PASS but its evidence quote is not a verbatim substring of the task output, THEN the harness shall count that practice as FAIL and report it as a fabricated quote. (verify via: unit test)
- AC-9: WHEN grading completes, the harness shall pass the case only if its grounding score (when declared) is 1 and its judge score (passed practices / total, counted after AC-8) is at least the case `threshold` (default 0.6); otherwise fail it. (verify via: unit test)
- AC-10: IF the task model call fails without producing any output, or the judge reply contains no parseable JSON with a `results` array, THEN the harness shall fail that case with the error message. (verify via: unit test)
- AC-11: WHEN a case fails, the failure message shall include the task output (grounding failure) or the per-practice verdict JSON (judge failure). (verify via: manual check)
- AC-12: WHEN any case failed, the eval command shall exit non-zero (vitest exit code); WHEN all passed, zero. (verify via: manual check)
- AC-13: IF `EVAL_BACKEND=openrouter` and `OPENROUTER_API_KEY` is not set, THEN the harness shall fail with a message naming `OPENROUTER_API_KEY` before sending any request. (verify via: unit test)
- AC-14: WHEN the harness starts, it shall take the task model from `EVAL_MODEL` (default `claude-haiku-4-5`) and the judge model from `EVAL_JUDGE_MODEL` (default `claude-sonnet-5`). (verify via: unit test)
- AC-15: WHEN the `onion-architecture` skill eval exists, it shall declare 3–4 `SkillCase`s in `skills/onion-architecture/onion-architecture.cases.ts` with fixtures under its `fixtures/`, run via `runSkillCases`. (verify via: manual check)
- AC-16: WHEN `onion-architecture/SKILL.md` is deliberately broken, its eval shall report at least one red case; WHEN the change is reverted, all its cases shall be green again. (verify via: manual check)
- AC-17: WHILE `EVAL_BACKEND` is unset or `subscription`, the harness shall run task and judge calls through the Claude Agent SDK with `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` removed from the spawned process environment. (verify via: unit test)
- AC-18: WHILE `EVAL_BACKEND=openrouter`, the harness shall run `skillTask` and judge calls as a direct OpenAI-compatible chat completion at temperature 0 against `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`). (verify via: unit test)
- AC-19: WHILE `EVAL_CONFIG=baseline`, `skillTask` shall send the identical user prompt without injecting the skill content. (verify via: unit test)
- AC-20: WHEN a case finishes, passing or failing, the harness shall append one record to `results/records.jsonl` and write the full output under `results/outputs/<run_id>/` before any assertion runs. (verify via: unit test)
- AC-21: WHEN `pnpm eval:quality [skill]` runs, the harness shall check each `SKILL.md` without a model call (required non-empty `name`/`description` frontmatter, `name` equals the directory, body length, at least 2 headings, internal links resolve), print PASS/WARN/FAIL per skill, and exit non-zero if any skill FAILs. (verify via: manual check)
- AC-22: WHEN `pnpm eval:skills dependency-checker` runs, the harness shall load `.claude/skills/dependency-checker/SKILL.md` and run the 3 cases in `skills/dependency-checker/dependency-checker.cases.ts` without a `SKILL.md not found` failure. (verify via: manual check)
- AC-23: WHEN the `dependency-checker` eval runs, each case shall meet its declared threshold (0.7 for the report-structure case including its `mermaid`/`flowchart` grounding, 0.6 for the other two). (verify via: manual check)
- AC-24: WHEN `.claude/skills/dependency-checker/SKILL.md` is checked with `pnpm eval:quality dependency-checker`, it shall not FAIL. (verify via: manual check)

## Edge cases
- Task output containing text that resembles instructions to the judge is still graded as data (see Untrusted inputs); AC-8 catches a judge that is talked into a PASS without real evidence.
- Judge returns no JSON, or JSON without `results[]`: the case fails with that reason (AC-10).
- Judge returns fewer results than practices: score is computed over the returned results (current behavior; total falls back to 1 when empty).
- OpenRouter returns HTTP 200 with no `choices`: surfaced as an error message in the output (the case is then graded on that text and fails grounding/judge).
- Baseline configuration with a grounding gate that fails: the judge is skipped, the record is still written (AC-20), and per-practice series stay empty rather than zero.
- `EVAL_BACKEND=openrouter` with the default `EVAL_MODEL` (`claude-haiku-4-5`) is not a valid OpenRouter slug; the README requires setting `EVAL_MODEL` together with the backend.

## Non-functional requirements
- Determinism: grounding scoring and the AC-8 quote check are pure code; temperature 0 on the OpenRouter backend.
- Cost/billing: the default backend never bills API tokens (AC-17).
- Secrets: `OPENROUTER_API_KEY` comes only from the environment (the proxy script may also read `~/.devdigest/secrets.json`) and is never printed or recorded.
- Timeouts: vitest `testTimeout` 240 s per case; OpenRouter client timeout 90 s.

## Inputs and provenance
- [reused: repo file] `.claude/skills/<skill>/SKILL.md` + `references/*.md` — the skill content under test.
- [deterministic: fixtures] case prompts, fixtures, `grounding` lists, practices, thresholds — authored in `<skill>.cases.ts` / `fixtures/`.
- [new: 1 LLM call per case] task model run (`EVAL_MODEL`).
- [new: 0–1 LLM calls per case] judge model run (`EVAL_JUDGE_MODEL`), skipped when grounding fails or no practices are declared.
- [deterministic: harness] grounding score, verbatim-evidence check, pass/fail, records, exit code.

## Untrusted inputs
- Fixture content is inlined into the user prompt as data; the skill content is the only system prompt.
- The task output reaches the judge under a separate `## OUTPUT` heading after the rubric and practices; it is never concatenated into the rubric.
- Judge evidence quotes are not trusted: each PASS is verified verbatim against the output (AC-8).

## Module interactions / API contracts
- Reads `.claude/skills/<skill>/` from the repo root; writes only under `evals/results/` (gitignored).
- `.claude/skills/dependency-checker/SKILL.md` is a prerequisite of AC-22..AC-24; the skill file itself is authored outside `evals/` (plan Phase 7.3), with requirements derived from the dependency-checker cases.
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) for the default backend; `openai` SDK against OpenRouter (or a LiteLLM proxy via `OPENROUTER_BASE_URL`) for the openrouter backend.
- No calls to `server/`, `client/`, or `reviewer-core/`.

## Open questions
None — all resolved 2026-10-07 (S1).
