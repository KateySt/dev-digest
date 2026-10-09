# Workflow retro: Project Context feature (session 2026-10-04, whole session)

Pipeline: spec-creator -> implementation-planner -> implementer -> architecture-reviewer (fix loop) -> plan-verifier -> doc-writer. Outcome: delivered, 9/9 plan items and AC-7 MET.

## Token spend

| Agent | Id | Invocations | Tokens | Share | Tool uses | Agent time |
|---|---|---|---|---|---|---|
| implementer | a3 | 2 (run + 1 fix round) | 216,000 (188,400 + 27,600) | 50.3% | 72 | 710 s |
| spec-creator | a1 | 3 (start + 2 resumes) | 71,600 (41,200 + 18,300 + 12,100) | 16.7% | 24 | 167 s |
| implementation-planner | a2 | 1 | 52,800 | 12.3% | 22 | 140 s |
| architecture-reviewer | b1 | 1 | 33,500 | 7.8% | 12 | 71 s |
| plan-verifier | a5 | 1 | 29,900 | 7.0% | 15 | 84 s |
| doc-writer | a6 | 1 | 21,700 | 5.1% | 9 | 55 s |
| architecture-reviewer (duplicate, stopped) | b2 | 1 | 4,100 | 1.0% | 2 | 9 s |
| **Total** | 7 agents | 10 runs | **429,600** | 100% | 156 | about 1,236 s summed (about 20.6 min; less wall-clock because b1/b2 overlapped) |

Note: the orchestrator's own tokens and the user's wait time on question rounds are not in the transcript, so they are not counted.

## Agent timeline

1. spec-creator a1: opened dialog, asked 3 questions (96 s).
2. User answered round 1; a1 resumed, drafted AC-1..6, asked a new scope question (41 s).
3. User answered round 2 (free-text "Other"); a1 resumed, wrote server/specs/project-context.md with AC-1..7 (30 s).
4. implementation-planner a2: 9-step plan (140 s).
5. implementer a3 (background): steps 1-9, tests and typecheck green (612 s, the long pole).
6. architecture-reviewer b1 and b2 launched together; b2 stopped after 9 s; b1 returned 1 CRITICAL (service.ts:41 imports the concrete Drizzle repo instead of the port) and 1 WARNING.
7. implementer a3 resumed: fixed both (98 s).
8. plan-verifier a5: 9/9 MET, AC-7 MET (84 s).
9. doc-writer a6: server/README.md plus mermaid sequence diagram (55 s).

## Round-trips per agent

- spec-creator: 2 resumes (3 invocations). Highest, and avoidable (see friction).
- implementer: 1 resume (the fix loop, a legitimate use).
- planner, reviewer b1, verifier, doc-writer: 0 (single shot).
- b2: spawned and killed, 0 useful.

## Per-agent friction

- **spec-creator:** Asked its questions in two batches. The write-back scope question (repo files vs DB only) was foreseeable and should have been in round 1. The cost was one extra resume (18.3k tokens) plus a second user interruption. The user's "Other" answer ("DB only, plus on-demand export button") shows the offered options did not fit, and it added AC-7, so scope was genuinely discovered late.
- **implementation-planner:** Re-read server/INSIGHTS.md and the onion-architecture skill from scratch even though they had already been quoted in the spec-creator output. Duplicated reading, probably a large part of its 22 tool uses and 52.8k tokens. The orchestrator did not pass that context in the prompt. The transcript also does not show the planner's expected up-front question (full multi-agent pipeline vs single-agent pass), so it is unclear whether that was asked or skipped.
- **implementer:** Biggest spend (half of all tokens) and longest runtime. It shipped a dependency-rule violation (concrete Drizzle repo imported in service.ts) that the plan and onion-architecture skill should have prevented. Its "all 9 steps done" claim was accurate, but it is a self-report. Cost of the fix round was 27.6k tokens, small relative to the first run.
- **architecture-reviewer b1:** Worked well; it caught a real CRITICAL with file:line evidence. Not re-run after the fix, so the CRITICAL's resolution was only confirmed indirectly (implementer re-ran tests; plan-verifier checks plan compliance, not layering).
- **architecture-reviewer b2:** Pure waste (4.1k tokens), see orchestration mistakes.
- **plan-verifier:** Clean, single shot, with test evidence.
- **doc-writer:** Clean. It ran after verification, as intended.
- **test-writer:** Never ran. The implementer wrote tests itself. The pipeline definition lists test-writer alongside the reviewer, so this is a deviation. It is not necessarily wrong, but it was not stated or decided explicitly in the transcript.

## User question load

- 2 AskUserQuestion rounds, 4 questions total (3 + 1). All from spec-creator.
- 1 of 4 answers was a free-text "Other", so the option set missed the real intent.
- Plus 1 opening request and 1 closing approval. Load is low overall, but the second round was avoidable if the scope question had been batched into the first.

## Orchestration mistakes

1. **Duplicate reviewer spawn (b2):** The first call looked like it had failed to return an id, but it hadn't. The orchestrator launched a second identical reviewer and then stopped it. Cost: 4.1k tokens and a TaskStop call. Fix: check the task list or wait for the notification before retrying a spawn.
2. **No context hand-off to the planner:** The INSIGHTS.md and skill content already in the session was not passed to a2, causing duplicate reading.
3. **Background mode with no parallel work:** The implementer ran in the background but nothing else could proceed until it finished. Harmless, but no benefit. Reviewer b1 was correctly parallelized in intent, then spoiled by the duplicate.
4. **Fix loop not closed:** After the implementer fixed the CRITICAL, the reviewer was not re-run.
5. **test-writer skipped** without a recorded decision.

## Recommendations

1. spec-creator: ask all scope questions up front, especially write-back and persistence scope, or ask the user for an open "anything else in scope?" in round 1. Offer an "export" style option where common. Target: one question round.
2. Orchestrator: pass the already-gathered INSIGHTS.md/skill excerpts (or paths plus a "do not re-read" note) into the planner prompt. Expected saving: a few thousand to about 10-15k tokens.
3. Orchestrator: never re-spawn on an ambiguous spawn result. Check state first. If a duplicate happens, stop it immediately, as was done here.
4. implementer prompt/plan: put the layering rule explicitly into the relevant plan step ("depend on the port, not the Drizzle repo"). It would avoid the CRITICAL and the fix round (about 27.6k tokens plus the reviewer-found cost).
5. After any CRITICAL fix, re-run a cheap, scoped architecture-reviewer pass on only the changed file.
6. Decide and state explicitly whether test-writer is part of the run. If the implementer owns tests, say so in the pipeline definition.
7. Budget watch: the implementer is 50% of spend. Consider splitting server and client steps or capping scope per run if this grows.

## Caveats

Token numbers come from the `<usage>` blocks only. Orchestrator tokens, the cost of the retro itself, and wall-clock gaps (user think time) are not measured.
