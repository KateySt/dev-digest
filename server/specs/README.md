# server/specs — feature specs

Index of feature/behavior specs for `server/` — "how X should work," written
before or alongside implementation. Not test files; server tests live in
`test/`, browser journeys in `../e2e/specs/`.

| Spec | Feature |
|------|---------|
| [`skills.md`](./skills.md) | Skill attachment, ordering, trust-by-source, versioning — **implemented** (extended by [`community-catalog.md`](./community-catalog.md)) |
| [`eval.md`](./eval.md) | Eval case scoring, single-run vs. workspace batch, agent-only ownership |
| [`ci.md`](./ci.md) | Publish/re-publish idempotency, skills-as-bodies config, no runner yet |
| [`project-context.md`](./project-context.md) | Project Context: markdown doc discovery, per-agent/per-skill attachment + order, token counts, run-time injection into the `## Project context` slot — **draft** (client side: [`../../client/specs/project-context.md`](../../client/specs/project-context.md)) |
| [`pr-triage-queue.md`](./pr-triage-queue.md) | Bulk review trigger over a repo's `needs_review` set: batch cap, in-flight skip, bounded parallelism, independent per-PR failure, cost estimate, cached blast size on the PR list — **draft** (client side: [`../../client/specs/pr-triage-queue.md`](../../client/specs/pr-triage-queue.md)) |
| [`community-catalog.md`](./community-catalog.md) | Community skill catalog: live GitHub-sourced catalog replacing the fixture, folder-per-topic layout contract, tag slugs replacing the single `lang` field, additive nullable `repo_id` project scoping, language-matched suggestions, one-request browsing budget with honest degradation; **amended 2026-10-02** with an opt-in project filter on the skills listing (default scope unchanged) and post-creation reassignment of a skill's project, in any direction including back to global — **draft** (extends [`skills.md`](./skills.md); client side: [`../../client/specs/community-catalog.md`](../../client/specs/community-catalog.md)) |
| [`onboarding-tour.md`](./onboarding-tour.md) | Onboarding Tour: deterministic `repo-intel` fact collection, PageRank-ordered reading path, commands derived from real repo files, exactly one structured LLM call, per-repo cached tour, degraded skeleton on partial index or model failure — **draft** (client side: [`../../client/specs/onboarding-tour.md`](../../client/specs/onboarding-tour.md)) |
