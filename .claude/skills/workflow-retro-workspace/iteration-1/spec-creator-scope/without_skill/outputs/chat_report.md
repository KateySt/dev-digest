# Retro: spec-creator dialog (Project Context feature), session 2026-10-04

Scope: only the spec-creator dialog (agent a1). Other agents in the session are not covered.

## Summary
- 1 agent (spec-creator, id a1), 1 launch + 2 resumes = 3 invocations (2 SendMessage round-trips).
- 2 AskUserQuestion rounds, 4 questions total (3 + 1). 1 answer was free-text "Other".
- Output: server/specs/project-context.md, AC-1..AC-7.

## Tokens and time
| Invocation | Tokens | Tool uses | Duration |
|---|---|---|---|
| Launch (dialog opened, 3 questions) | 41,200 | 14 | 96 s |
| Resume 1 (draft AC-1..6, new question) | 18,300 | 6 | 41 s |
| Resume 2 (spec written) | 12,100 | 4 | 30 s |
| **Total** | **71,600** | **24** | **167 s** |

Cost is front-loaded: 58% of tokens went into the first invocation (INSIGHTS.md and context reading plus drafting questions). Later resumes were cheap. Human wait time on the answers is not measured in the transcript.

## Round-trips
1. Launch -> 3 questions (storage, max note size, editors). Answers: Postgres table, 8 KB, any user.
2. Resume 1 -> spec drafted with AC-1..6, then a 4th question (write-back scope) that was not in round 1.
3. Resume 2 -> answer "DB only, but export to server/specs on demand via a button" -> spec written, AC-7 added.

## Friction
- Question split across rounds: the write-back scope (repo files vs DB only) was a foundational scope question, discoverable at the start, but surfaced only after AC-1..6 were drafted. This cost one extra round-trip (about 30k tokens, 71 s) and the draft ACs were partly invalidated: the answer added a new capability (export button, AC-7).
- The offered options did not fit: the user chose "Other" and described a hybrid. The options were presented as mutually exclusive when the real need was DB storage plus on-demand export.
- The launch prompt was one line ("Create a feature spec for Project Context ...") with no constraints, so the agent had to discover everything through questions.
- Positive: final spec was accepted without further rework, and plan-verifier later found AC-7 MET (evidence the dialog result was usable).

## User question load
- 4 questions over 2 rounds; 3 were simple option picks, 1 required typing. Light overall, but the second interruption was avoidable.

## Recommendations
1. spec-creator: front-load a scope/boundary check (storage, write-back, who edits, integration points) in the first question batch, before drafting any AC. Draft ACs only after all scope questions are answered.
2. spec-creator: when a question's options could combine (store + export), allow multi-select or add a "DB + export" style option, to avoid "Other" answers.
3. Orchestrator: give spec-creator a richer launch prompt (known constraints, module hints such as server/, expected integration with the reviewer prompt) to cut the first-round question count and discovery cost.
4. Orchestrator: consider asking the user one "anything else in scope?" question in round 1.
5. Track wall time of user answers if latency matters; it is not in the usage data.
