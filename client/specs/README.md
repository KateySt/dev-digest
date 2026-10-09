# client/specs — feature specs

Index of feature/behavior specs for `client/` — "how X should work," written
before or alongside implementation. Not test files; component tests are
colocated `*.test.tsx`, browser journeys live in `../e2e/specs/`.

| Spec | Feature |
|------|---------|
| [`agent-evals.md`](./agent-evals.md) | Evals regression harness UI: FindingCard Turn into eval case / Reply to author (Learn slot only, behavior split out), Evals tab with suite-run metrics and deltas, per-agent dashboard (range filter, regression banner, run history), Compare runs modal + Promote, cross-agent Eval Dashboard with Run all agents, Case Editor structured fields + DiffView preview + Advanced JSON toggle + line-range validation, per-target "Turn into eval case", `empty []` chip; **amended 2026-10-06**; **amended 2026-10-07** (Advanced JSON must parse and be an array to Save/Run, no duplicate case after first save) — **draft** (Evals tab, case editor, `/eval` page already built; server side: [`../../server/specs/eval.md`](../../server/specs/eval.md)) |
| [`skill-evals.md`](./skill-evals.md) | Skill evals UI: Skill Editor header type badge + "Run on evals" draft runs, Evals tab with metrics/deltas, mini trend, background progress and scan-gated buttons, per-skill dashboard + Compare/Promote, `/eval` Agents/Skills tabs with Run all skills, "Turn into eval case" target picker — **draft** (Case Editor changes live in `agent-evals.md`; server side: [`../../server/specs/skill-evals.md`](../../server/specs/skill-evals.md)) |
| [`agent-performance.md`](./agent-performance.md) | Agent Editor Stats tab + global Agent Performance page (one feature) — **implemented** |
| [`agent-ci.md`](./agent-ci.md) | Agent Editor CI tab + Publish to CI + CI Runs — **implemented** (Publish only; the multi-target Export wizard stayed out of scope) |
| [`project-context.md`](./project-context.md) | Project Context page + Agent/Skill Editor Context tabs + Prompt assembly "Project context" block; **amended 2026-10-07** (refusal rendered from the 409's `details.paths` or the persisted reason, optimistic serialized attach with rollback) — **draft** (server side: [`../../server/specs/project-context.md`](../../server/specs/project-context.md)) |
| [`pr-triage-queue.md`](./pr-triage-queue.md) | PR list Triage queue toggle + "Highest risk" sort + per-row Run Review + "Review all" bulk action; **amended 2026-10-07** (AC-28/29 verified by unit test with mocked `EventSource`, "review already running" on 409) — **draft** (server side: [`../../server/specs/pr-triage-queue.md`](../../server/specs/pr-triage-queue.md)) |
| [`onboarding-tour.md`](./onboarding-tour.md) | Onboarding Tour page at `/repos/:repoId/onboarding`: five collapsible section cards + anchor nav, explicit Generate/Regenerate, non-blocking regeneration, partial-index and degraded banners, Mermaid fallback; **amended 2026-10-07** (~150 s poll ceiling as a failure state that re-enables Regenerate) — **draft** (server side: [`../../server/specs/onboarding-tour.md`](../../server/specs/onboarding-tour.md)) |
| [`community-catalog.md`](./community-catalog.md) | Community catalog UI: Add Skill drawer's Community tab rebuilt as a collapsed folder accordion with deterministic-color tag chips and a required project picker, three distinct unavailable/empty/no-match states, new Settings → Catalog section with a Test action, per-project suggestions on the repo onboarding page + a pinned group in the drawer, tags and project-scope badges on the Skills page; **amended 2026-10-07** (records the shipped project-scope switcher and Config-tab project picker, AC-53 – AC-58) — **draft** (server side: [`../../server/specs/community-catalog.md`](../../server/specs/community-catalog.md)) |

## Known small gaps (not worth a dedicated spec)

- **Agents list "Start from template"** — the dropdown's template items
  (`AgentsListView/constants.ts`'s `TEMPLATES`) all call the same
  `setCreating(true)` as "Create from scratch"; none of them actually
  pre-fill the create-agent modal's fields from a template. Fix is local to
  `CreateAgentModal` (accept an optional initial-values prop) + `TEMPLATES`
  gaining real field values instead of just labels — no schema/i18n work
  needed.
