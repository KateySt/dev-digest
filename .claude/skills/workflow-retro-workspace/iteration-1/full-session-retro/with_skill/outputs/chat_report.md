# Workflow retro: Project Context feature (session 2026-10-04)

**Scope:** whole session (no --deep; in-context data only). Subagent transcripts were not read.

## Token ledger

Per agent instance (`subagent_tokens`):

| Instance | Type | Calls | Tokens |
|---|---|---|---|
| a1 | spec-creator | spawn 41,200 + resume 18,300 + resume 12,100 | 71,600 |
| a2 | implementation-planner | 52,800 | 52,800 |
| a3 | implementer | spawn 188,400 + resume 27,600 | 216,000 |
| b1 | architecture-reviewer | 33,500 | 33,500 |
| b2 | architecture-reviewer (accidental duplicate, stopped) | 4,100 | 4,100 |
| a5 | plan-verifier | 29,900 | 29,900 |
| a6 | doc-writer | 21,700 | 21,700 |

Per agent type: implementer 216,000 (50%); spec-creator 71,600; implementation-planner 52,800; architecture-reviewer 37,600 (4,100 wasted); plan-verifier 29,900; doc-writer 21,700.

**Total subagent tokens: 429,600** across 7 instances and 11 calls. Tool uses were 24 + 22 + 72 + 14 + 2 + 15 + 9 = 158.

The total session token count (the orchestrator's own context and spend) is not readable from inside a skill, so I'm not giving a figure. 429,600 covers subagents only.

## Agent timeline

| # | Call | Type | Mode | tool_uses | duration |
|---|---|---|---|---|---|
| 1 | spawn a1 | spec-creator | foreground | 14 | 96 s |
| 2 | resume a1 (round 1) | spec-creator | resume via SendMessage | 6 | 41 s |
| 3 | resume a1 (round 2) | spec-creator | resume via SendMessage | 4 | 30 s |
| 4 | spawn a2 | implementation-planner | foreground | 22 | 140 s |
| 5 | spawn a3 | implementer | background | 61 | 612 s |
| 6 | spawn b1 | architecture-reviewer | background | 12 | 71 s |
| 7 | spawn b2 (mistake) | architecture-reviewer | background, stopped with TaskStop | 2 | 9 s |
| 8 | resume a3 (round 1) | implementer | resume via SendMessage | 11 | 98 s |
| 9 | spawn a5 | plan-verifier | foreground | 15 | 84 s |
| 10 | spawn a6 | doc-writer | foreground | 9 | 55 s |

The order was spec-creator, planner, implementer, reviewer, implementer fix, verifier, doc-writer. It is strictly serial apart from the b1/b2 overlap. About 1,340 s of agent time in total, about 45% of it the first implementer run.

## Round-trips

- **spec-creator a1: 2 resumes.** Round 1 supplied storage, note size and editors. Round 2 supplied write-back scope: "DB only, export on demand via a button". This is the one high-round finding (see friction).
- **implementer a3: 1 resume.** It carried the architecture-reviewer's CRITICAL and WARNING. This is a normal fix loop.
- All other agents ran once with no resumes.

## Per-agent friction

- **spec-creator (a1).** It asked 3 questions up front, then in round 1 raised a fourth topic, write-back scope, that was knowable at the start. That cost one extra SendMessage, one extra user round and 12,100 tokens for the final spec write. The dialog's initial question set did not cover "does an accepted edit leave the DB". The user's answer was free text, so the topic also needed an option the agent did not offer. Everything else, including AC-1..AC-7, was drafted without help.
- **implementation-planner (a2).** It re-read `server/INSIGHTS.md` and the onion-architecture skill from scratch, although both had been quoted earlier in the spec-creator output. That is duplicated work: 22 tool uses and the second-largest pre-implementation spend (52,800). The orchestrator's prompt did not pass those excerpts along. The plan itself was good: 9 steps, each traced to an AC.
- **implementer (a3).** It got all 9 steps done and reported tests and typecheck green. It missed a dependency-rule violation: `service.ts:41` imports the concrete Drizzle repository instead of the port. The reviewer caught this, and it cost a 27,600-token fix round. The implementer's "all 9 steps done" was true to the plan but said nothing about layering. That is by design (the implementer does no architecture review), but the onion-architecture skill was available, and the planner was meant to surface it.
- **architecture-reviewer (b1).** It did well. It found a real CRITICAL with file:line evidence, plus a WARNING, in 71 s. The reviewer itself is not at fault for the duplicate (see self-critique).
- **plan-verifier (a5).** It reported 9/9 MET and AC-7 MET with test evidence, and nothing was missed. It ran after the fix, so it covered the fixed code.
- **doc-writer (a6).** It updated `server/README.md` and added a mermaid sequence diagram. No friction visible.

## User question load

- 2 `AskUserQuestion` rounds, 4 questions total (3 + 1).
- 3 of 4 answers were listed options. 1 of 4 was free text ("Other"): "DB only, but export to server/specs on demand via a button". The offered options (repo files / DB only / ask per edit) did not fit the real decision, a hybrid with on-demand export, so the option set was too coarse. The free-text answer also added a new requirement, AC-7.
- The load would have been 1 round instead of 2 if write-back scope had been asked first.

## Orchestration self-critique

1. **Duplicate spawn.** The orchestrator spawned architecture-reviewer twice (b1, b2) because the first call looked like it had returned no id. It had not failed. b2 was then stopped after about 9 s, wasting 4,100 tokens plus the TaskStop call. The check that was missing: look for a task-notification or the first call's id before retrying a background spawn.
2. **No re-review after the fix.** After a3's fix round, the orchestrator went straight to plan-verifier. plan-verifier does not judge architecture, so nothing confirms the CRITICAL at `service.ts:41` is actually resolved beyond the implementer's "fixed both; re-ran tests". This is a gap, not a proven miss.
3. **Context not forwarded to the planner.** The orchestrator already held the INSIGHTS and skill excerpts and did not pass them into a2's prompt (see friction).
4. **test-writer never ran.** The pipeline description lists test-writer alongside architecture-reviewer. The implementer wrote tests itself and the transcript doesn't show a deliberate decision to skip test-writer. I can't tell from this scope whether that was intended, so I'm flagging it rather than calling it a miss.

## Recommendations

**Prompt wording**
- `.claude/agents/spec-creator.md`: add "does an accepted edit get written back outside the DB or exported?" to the initial dialog categories (module interactions or input provenance), so it's asked in round 1. Also have it offer a "hybrid / other" option when proposing storage or output choices.
- Orchestrator prompt to `implementation-planner`: include the INSIGHTS.md and skill excerpts already in context, with "don't re-read these", or add that line to `.claude/agents/implementation-planner.md`.
- `.claude/agents/implementer.md`: add a self-check that imports in service/application layers reference ports, not concrete adapters, with the onion-architecture skill named.

**Orchestration process**
- Before re-spawning a background agent, check for the first call's id or task-notification. Never spawn a second identical agent on the strength of "looks like it failed".
- After an implementer fix round that addresses a CRITICAL, re-run architecture-reviewer (or at least the affected file) before plan-verifier.

**Tooling/automation gap**
- No clear gap this run. A guard against duplicate identical background spawns could be a hook, but one occurrence doesn't justify it.

## Top recommendations to act on

1. Fold write-back/export scope into spec-creator's initial dialog (saves 1 round-trip, 1 user round, avoids a free-text miss).
2. Add a re-review step after a CRITICAL fix, before plan-verifier.
3. Pass already-gathered INSIGHTS/skill context to implementation-planner instead of letting it re-read (an unknown share of its 52,800 tokens). Also never retry a background spawn without confirming the first one failed.
