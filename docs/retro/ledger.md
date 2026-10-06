# Workflow retro ledger

Append-only log of retrospectives on multi-agent workflows in this repo —
token spend, agent call order, friction, and recommendations. Written only
by the `workflow-retro` skill (`.claude/skills/workflow-retro/SKILL.md`),
run manually — never automatically. Newest entry first, never rewrite or
delete a prior entry; correct it with a new dated one instead.

## Format

```
### YYYY-MM-DD — short label for the workflow
**Scope:** what part of the session this covers
**Agents:** ordered call list, e.g. spec-creator ×2 rounds → (user) → spec-creator ×1 round
**Tokens:** per-agent subagent_tokens, summed; note explicitly if the total session count isn't knowable
**Friction:** the 2-4 things that actually cost rounds or tokens — cold-read testable
**Recommendations:** concrete, actionable bullets
```

---
