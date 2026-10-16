# Specs — cross-module specifications

This top-level `specs/` directory holds Spec-Driven Development (SDD) specifications
that span **two or more** modules. Single-module specs live next to their module
instead — keep a spec as close to the code it governs as its scope allows.

| Spec scope | Location |
|------------|----------|
| `server` only | `server/specs/` |
| `client` only | `client/specs/` |
| `reviewer-core` only | `reviewer-core/specs/` |
| `e2e` only | `e2e/specs/` |
| **cross-module (≥ 2 modules)** | `specs/` (here) |

## What a spec is

Specs are authored by the **`spec-creator`** agent (`.claude/agents/spec-creator.md`).

A spec describes **what** a feature must do and **why** — the problem, goals /
non-goals, user stories, EARS acceptance criteria, edge cases, cross-module
interactions, and contracts. It deliberately stops short of **how** to implement it
(file-by-file tasks, layers, code) — that is the `implementation-planner` agent's
Development Plan (`docs/plans/`). The intended chain is:

```
spec-creator → spec (WHAT/WHY) → implementation-planner → plan (HOW) → implementer → code
```

## Conventions

- **File name:** `YYYY-MM-DD-<kebab-feature-name>.md`
- **Spec ID** (in the header line): `SPEC-YYYY-MM-DD-<kebab-feature-name>`
- **Status lifecycle:** `draft` → `approved` → `implemented`
- **Language:** specs are written in English (aligned with the rest of the repo docs).

## Index

| Spec | Feature |
|------|---------|
| [`2026-06-30-project-context.md`](./2026-06-30-project-context.md) | Project Context |
| [`2026-10-12-memory.md`](./2026-10-12-memory.md) | Memory |
| [`2026-10-12-memory-curation.md`](./2026-10-12-memory-curation.md) | Memory curation (manual Curate action) |
| [`2026-10-16-convention-skills.md`](./2026-10-16-convention-skills.md) | Skills from Conventions: checkbox selection instead of status juggling, `conventions.skill_id` link, project/global scope at creation — **implemented** (plan: `docs/plans/2026-10-16-convention-skills-plan.md`) |

A spec that replaces an earlier decision links it via the `Supersedes:` header line.
