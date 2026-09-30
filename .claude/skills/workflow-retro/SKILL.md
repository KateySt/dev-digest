---
name: workflow-retro
description: Produces a retrospective on a completed multi-agent workflow in this session (e.g. a spec-creator dialog, the /implement pipeline, or any run that involved several Agent/SendMessage calls) — token spend per agent and total, how many agents ran and in what order, round-trip count per agent, per-agent friction (difficulties, duplicated work, things missed), user question load, and concrete recommendations for the workflow, the skill, or the agents involved. Manual only — never run this on your own initiative right after a multi-agent workflow finishes, no matter how large the workflow was; only run it when the user explicitly asks — "/workflow-retro", "run a retro on this session", "how did that workflow go", "retro this", "how did the agents do".
---

# Workflow retro

## When to use

**Manual only.** Never trigger this on your own initiative — not even
immediately after a large multi-agent pipeline completes. Run it only when
the user explicitly asks, via `/workflow-retro` or an equivalent direct
request ("retro this", "how did that workflow go", "how did the agents do").
If you're unsure whether a request counts, ask — don't default to running it.

## Scope

Default scope is the **whole current session** from its start. If the user
names a narrower window ("just the spec-creator dialog", "since the Project
Context work started"), scope to that instead — say which scope you used at
the top of the report so it's never ambiguous later.

## Data sources

### Default — in-context

Everything already visible in this conversation's transcript:

- `Agent` tool results and `task-notification` blocks — each carries a
  `<usage>` block (`subagent_tokens`, `tool_uses`, `duration_ms`)
- `SendMessage` calls and the resumed-agent notifications they produce —
  this is how you count round-trips per agent
- `AskUserQuestion` calls — how many rounds, how many questions per round,
  whether the user picked a listed option or wrote free text ("Other")
- Any visible mistake or correction — a misrouted message, a duplicate spawn,
  a stopped task, a user correction of the orchestrator's own action

### `--deep` — explicit opt-in only

Only when the user asks for `--deep` (or "go deep", "look at the actual
transcripts"):

- Read the full subagent transcript from the `output_file` path printed in
  each `task-notification` block — this shows what the subagent itself
  explored/struggled with, not just what it reported back
- Cross-reference the relevant agent definition file(s) under `.claude/agents/`
  to check whether a friction point traces back to an underspecified prompt
  in the agent's own system prompt

Deep mode costs real tokens and time (extra `Read` calls per agent instance)
— don't do it unless asked, and say so if the user's request is ambiguous
about which mode they want.

## What to collect

1. **Token & cost ledger** — `subagent_tokens` per Agent/SendMessage call,
   summed per agent instance and per agent type. Total *session* token count
   is not something a skill can read directly — say that plainly instead of
   guessing at a number you don't have.
2. **Agent timeline** — ordered list of every Agent/SendMessage call: agent
   type, spawn vs. resume, foreground vs. background, `duration_ms`,
   `tool_uses`.
3. **Round-trip count per agent** — how many times each agent instance was
   resumed via `SendMessage`, and what new information each round supplied.
   A high round count on one agent instance is itself a finding, not just
   bookkeeping — it usually means the first prompt to that agent was missing
   something knowable up front.
4. **Per-agent friction** — for each agent instance: what it got right
   without help, where it got stuck or asked for missing info, what it
   re-derived that was already established earlier in context (duplicated
   work), what it appears to have missed (compare its own report against
   what the orchestrator actually knows landed).
5. **User question load** — total `AskUserQuestion` rounds and questions in
   this scope, and whether any answer was free-text ("Other") rather than a
   listed option — that's a signal the offered options didn't fit the real
   decision space.
6. **Orchestration self-critique** — mistakes the orchestrating session
   itself made (not just downstream agents): a wrongly spawned duplicate, a
   message sent to the wrong recipient, a redundant call. Be honest about
   these; a retro that only critiques subagents isn't a real retro.
7. **Recommendations**, split into three buckets so they're actionable:
   - **Prompt wording** — name the specific `SKILL.md` or `.claude/agents/*.md`
     file and the exact ambiguity that caused the friction.
   - **Orchestration process** — e.g. "batch these N scoping questions into
     one round instead of three."
   - **Tooling/automation gap** — a step that had to be done by hand this run
     that a script or hook could do instead.

## Quality bar

Same cold-read test as `engineering-insights`: if a reader with zero memory
of this session couldn't read a finding and know exactly what to change,
don't write it. "Agent X had some trouble" is noise; "spec-creator needed 3
extra SendMessage rounds because round-1 didn't ask about write-back scope
up front — fold that question into its own initial dialog category" is a
finding.

## Output

Two outputs, always both:

### 1. Chat report

Structured under the headings above (Token ledger / Agent timeline /
Round-trips / Per-agent friction / User question load /
Orchestration self-critique / Recommendations), specific and evidence-backed
(name the actual agent, round, or tool call). End with the top 1-3
recommendations actually worth acting on — don't bury the signal in a long
list.

### 2. Ledger entry

Append to `docs/retro/ledger.md` — create the file with its header (below) if
it doesn't exist yet. Newest entry first, same append-only discipline as
`engineering-insights`' `INSIGHTS.md` files: never rewrite or delete a prior
entry, correct it with a new dated one instead.

```
### YYYY-MM-DD — short label for the workflow
**Scope:** what part of the session this covers
**Agents:** ordered call list, e.g. spec-creator ×2 rounds → (user) → spec-creator ×1 round
**Tokens:** per-agent subagent_tokens, summed; note explicitly if the total session count isn't knowable
**Friction:** the 2-4 things that actually cost rounds or tokens — cold-read testable
**Recommendations:** the same top 1-3 from the chat report, concrete and actionable
```

If nothing from this run clears the quality bar for a category, say so
plainly in that section rather than manufacturing filler.
