---
description: Run a retrospective on this session's multi-agent workflow — tokens, agent order, friction, recommendations — and append it to docs/retro/ledger.md
argument-hint: [--deep] [optional scope, e.g. "just the spec-creator dialog"]
---

Run the `workflow-retro` skill on this session now — this command is exactly
the manual trigger its "When to use" section expects. Never run this skill
on your own initiative outside of this command or an equally explicit
request.

`$ARGUMENTS` may contain `--deep` (pull full subagent transcripts from their
output files instead of only in-context summaries) and/or a scope
description narrowing which part of this session to retro. With no
arguments: in-context only, whole session.

Follow the skill's own procedure for what to collect and how to write the
ledger entry — don't improvise a different report shape here.
