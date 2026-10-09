# Workflow retro: spec-creator dialog (Project Context)

**Scope used:** only the spec-creator dialog. That is the first Agent call through the second resume (a1), including the two AskUserQuestion rounds between them. implementation-planner, implementer, architecture-reviewer (b1/b2), plan-verifier and doc-writer are out of scope and not analyzed. Mode: in-context (no --deep).

## Token ledger

| Call | Agent | subagent_tokens | tool_uses | duration |
|---|---|---|---|---|
| Spawn | spec-creator (a1) | 41,200 | 14 | 96 s |
| Resume 1 | spec-creator (a1) | 18,300 | 6 | 41 s |
| Resume 2 | spec-creator (a1) | 12,100 | 4 | 30 s |
| **Total in scope** | | **71,600** | 24 | 167 s |

The total session token count (orchestrator plus all agents) isn't readable from inside a skill, so I'm not giving one. 71,600 is subagent tokens for a1 only.

## Agent timeline

1. spec-creator (a1), spawn, foreground. It opened the dialog and asked 3 questions (storage, max note size, editors).
2. (user) AskUserQuestion round 1, 3 questions.
3. spec-creator (a1), resume via SendMessage, round 1. It drafted AC-1..AC-6, then asked a new question about write-back scope.
4. (user) AskUserQuestion round 2, 1 question.
5. spec-creator (a1), resume via SendMessage, round 2. It wrote server/specs/project-context.md (AC-1..AC-7).

## Round-trips

- a1 was resumed 2 times, so it ran 3 turns.
- Resume 1 supplied: Postgres table, 8 KB, any user.
- Resume 2 supplied: DB only, plus on-demand export to server/specs via a button.
- The second resume was avoidable. The write-back question was knowable at the start, and it changed the spec: AC-7 (the export button) exists only because of that answer. One of the 2 resumes was therefore a late scoping question, not new information the user hadn't already been able to give.

## Per-agent friction (spec-creator a1)

- **Got right without help:** it picked sensible first-round questions (storage, size, editors) and, once it had answers, drafted AC-1..AC-6 in one pass.
- **Missed up front:** write-back scope (DB only vs. repo files) was only raised after the draft existed, in resume 1 ("this scope was not asked in round 1"). It is a data-ownership and side-effect decision, so it belongs in the first dialog batch. It was not in the first batch even though spec-creator's definition says it runs a 6-category dialog. The first round covered only 3 questions, so categories appear to be asked piecemeal across turns, not batched.
- **Cost of the miss:** one extra user round and about 30k tokens across resumes 1 and 2. Part of resume 1's 18.3k was the draft itself, so I'm not attributing all of it to the miss. Resume 2 (12.1k) was mostly spec finalization with AC-7 added.
- **Duplicated work:** none visible in this scope.
- **Not visible:** whether a1 read server/INSIGHTS.md, and what the 14 tool uses in the spawn were. Answering that needs --deep.

## User question load

- 2 AskUserQuestion rounds, 4 questions total (3 + 1).
- 3 of 4 answers were listed options.
- 1 of 4 was free text ("Other"): the write-back question. The user typed "DB only, but export to server/specs on demand via a button". The offered options [repo files | DB only | ask per edit] didn't fit the real decision, which was a hybrid. That is a signal the option set was too binary, and the user's answer added a new requirement (AC-7).
- The user never saw the write-back question until after a draft existed.

## Orchestration self-critique

- Within this scope the orchestrator made no visible mistake: no misrouted message, no duplicate spawn, and both answers went to the right agent (a1).
- Missed opportunity: the initial prompt was one line ("Create a feature spec for Project Context (per-repo notes injected into review prompts)"). It gave a1 no hint about integration boundaries such as whether the feature touches repo files. The orchestrator also relayed a1's questions verbatim with no attempt to add an "Other/hybrid" option for write-back. That is a minor point, and the real fix belongs in spec-creator's prompt.
- Each answer was sent as its own SendMessage, which was correct given the agent asked sequentially.

## Recommendations

**Prompt wording**
- `.claude/agents/spec-creator.md`: require the first dialog batch to cover side effects and write-back (does this feature write to repo files, DB, or external systems?) alongside storage, size, and editors. Ask all questions that decide the AC set in one round, before drafting any AC. Ask them before drafting, not after, so a late answer doesn't reopen the draft.
- Same file: when offering options for scope or write-back questions, include a "hybrid / on-demand" choice, or say that free text is welcome.

**Orchestration process**
- When spawning spec-creator, add a one-line "known boundaries" hint to the prompt: any side effects, files or modules touched. This lets a1 skip questions it would otherwise ask late.
- If an agent asks a question mid-dialog that looks like it belonged in an earlier batch, note it for the retro. Don't act on it in the moment.

**Tooling/automation gap**
- None identified in this scope.

## Top recommendations

1. Make spec-creator ask write-back/side-effect scope in its first question batch, before drafting ACs. This removes the one avoidable round (about 30k tokens and one user round) seen here.
2. Give that question an option that fits hybrid answers. The user had to use "Other" to say what they actually wanted.
3. Pass known boundaries into the spec-creator spawn prompt so it doesn't have to discover them through questions.
