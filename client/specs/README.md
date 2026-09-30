# client/specs — feature specs

Index of feature/behavior specs for `client/` — "how X should work," written
before or alongside implementation. Not test files; component tests are
colocated `*.test.tsx`, browser journeys live in `../e2e/specs/`.

| Spec | Feature |
|------|---------|
| [`agent-evals.md`](./agent-evals.md) | Agent Editor Evals tab + Eval Case Editor + Eval Dashboard — **implemented** |
| [`agent-performance.md`](./agent-performance.md) | Agent Editor Stats tab + global Agent Performance page (one feature) — **implemented** |
| [`agent-ci.md`](./agent-ci.md) | Agent Editor CI tab + Publish to CI + CI Runs — **implemented** (Publish only; the multi-target Export wizard stayed out of scope) |
| [`project-context.md`](./project-context.md) | Project Context page + Agent/Skill Editor Context tabs + Prompt assembly "Project context" block — **draft** (server side: [`../../server/specs/project-context.md`](../../server/specs/project-context.md)) |
| [`pr-triage-queue.md`](./pr-triage-queue.md) | PR list Triage queue toggle + "Highest risk" sort + per-row Run Review + "Review all" bulk action — **draft** (server side: [`../../server/specs/pr-triage-queue.md`](../../server/specs/pr-triage-queue.md)) |

## Known small gaps (not worth a dedicated spec)

- **Agents list "Start from template"** — the dropdown's template items
  (`AgentsListView/constants.ts`'s `TEMPLATES`) all call the same
  `setCreating(true)` as "Create from scratch"; none of them actually
  pre-fill the create-agent modal's fields from a template. Fix is local to
  `CreateAgentModal` (accept an optional initial-values prop) + `TEMPLATES`
  gaining real field values instead of just labels — no schema/i18n work
  needed.
