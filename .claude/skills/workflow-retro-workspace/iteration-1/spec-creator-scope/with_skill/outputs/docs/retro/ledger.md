# Workflow retro ledger

Append-only, newest entry first. Never rewrite or delete a prior entry; correct it with a new dated one.

### 2026-10-04 — Project Context spec-creator dialog
**Scope:** only the spec-creator dialog (spawn + 2 resumes, 2 AskUserQuestion rounds). Later pipeline stages were not analyzed.
**Agents:** spec-creator a1 spawn → (user, round 1: 3 questions) → spec-creator ×1 resume → (user, round 2: 1 question) → spec-creator ×1 resume
**Tokens:** spec-creator a1: 41,200 + 18,300 + 12,100 = 71,600 subagent_tokens (24 tool uses, 167 s). Total session token count isn't knowable from inside a skill.
**Friction:**
- Write-back scope (repo files vs DB only) was not asked in the first question batch. spec-creator raised it only after drafting AC-1..AC-6, costing one extra user round and one extra resume.
- The write-back options [repo files | DB only | ask per edit] didn't fit. The user answered via "Other" with a hybrid (DB only plus on-demand export button), which added AC-7.
- 3 of 4 answers were listed options. 1 of 4 was free text.
**Recommendations:**
1. In `.claude/agents/spec-creator.md`, require the first dialog batch to cover side effects and write-back scope, and ask them before drafting any AC.
2. Offer a hybrid / on-demand option, or invite free text, on scope questions.
3. When spawning spec-creator, pass known boundaries (files or modules touched, side effects) in the prompt.
