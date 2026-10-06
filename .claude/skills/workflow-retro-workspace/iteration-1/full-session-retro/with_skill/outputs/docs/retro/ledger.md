# Workflow retro ledger

Append-only, newest entry first. Never rewrite a prior entry; correct it with a new dated one.

### 2026-10-04 — Project Context feature (spec → plan → implement → review → verify → docs)
**Scope:** whole session; in-context data only (no --deep)
**Agents:** spec-creator ×3 calls (spawn + 2 resumes, 2 user question rounds between) → implementation-planner ×1 → implementer ×1 (background) → architecture-reviewer ×2 (b2 accidental duplicate, stopped) → implementer ×1 resume (fix loop) → plan-verifier ×1 → doc-writer ×1
**Tokens:** spec-creator 71,600 (41,200+18,300+12,100); implementation-planner 52,800; implementer 216,000 (188,400+27,600); architecture-reviewer 37,600 (33,500 + 4,100 wasted on b2); plan-verifier 29,900; doc-writer 21,700. Subagent total 429,600. Total session token count (orchestrator included) is not knowable from within a skill.
**Friction:**
- spec-creator asked write-back scope only in round 1, after the initial 3 questions. This cost an extra resume, an extra user round and a free-text "Other" answer (the options did not cover "DB only plus on-demand export").
- implementation-planner re-read server/INSIGHTS.md and the onion-architecture skill, which were already quoted in context, because the orchestrator did not pass them in.
- Orchestrator spawned a duplicate architecture-reviewer (b2) after wrongly assuming the first spawn failed; 4,100 tokens wasted plus a TaskStop.
- The implementer shipped a dependency-rule violation (service.ts:41 imports the concrete Drizzle repo), caught by the reviewer and fixed in a 27,600-token round. The fix was not re-reviewed before plan-verifier.
**Recommendations:**
- Add write-back/export scope to spec-creator's initial dialog categories, with a hybrid/other option, so it is asked in round 1.
- After a CRITICAL fix round, re-run architecture-reviewer before plan-verifier.
- Pass already-gathered INSIGHTS/skill context into the implementation-planner prompt, and never retry a background spawn without confirming the first one failed.
