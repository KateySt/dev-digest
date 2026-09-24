# Agents

Custom Claude Code subagents for this repo. Each is a markdown file with YAML
frontmatter (`name`, `description`, `tools`, `model`) whose body is the
subagent's system prompt; invoked via the `Agent` tool by name. This file is
a map of the set — read the agent's own file for its full system prompt and
exact output template. Companion catalog: `.claude/skills/README.md` (domain
knowledge, loaded on-demand) vs. this one (workflows, invoked explicitly).

## Catalog

| Agent | Model | Permissions | Input | Output |
|---|---|---|---|---|
| [researcher](researcher.md) | sonnet | read-only: `Read, Grep, Glob, Bash, WebSearch, WebFetch` | a research question (repo- or external-source-scoped) | structured report: Findings / Evidence / References / Could not find |
| [planner](planner.md) | opus | read-only: `Read, Grep, Glob, Bash, Skill, Agent(researcher)` | a feature/task request | a Development Plan |
| [implementer](implementer.md) | sonnet | write: `Read, Grep, Glob, Bash, Write, Edit, Skill` | a Development Plan (or a small, obviously-scoped task) | an Implementation Report |
| [test-writer](test-writer.md) | sonnet | write, test files only by convention (not mechanically enforced): `Read, Grep, Glob, Bash, Write, Edit, Skill` | implemented code needing coverage | a Test Report |
| [architecture-reviewer](architecture-reviewer.md) | sonnet | read-only: `Read, Grep, Glob, Bash, Skill` | a diff or file set | an Architecture Review (findings + verdict) |
| [plan-verifier](plan-verifier.md) | opus | read-only: `Read, Grep, Glob, Bash` | a Development Plan (+ optional Implementation Report) | a Plan Verification (MET/NOT MET traceability) |
| [doc-writer](doc-writer.md) | sonnet | write: `Read, Grep, Glob, Bash, Write, Edit, Skill` | an Implementation Report, a diff, or a Development Plan (spec-from-plan) | a Documentation Update |

Flow for a non-trivial feature: **planner** produces a Development Plan →
**implementer** executes it → **test-writer** adds coverage →
**plan-verifier** traces the result back against the plan →
**doc-writer** documents what shipped. **architecture-reviewer** runs
read-only, any time after implementer (typically alongside `pr-self-review`
before opening a PR) — independent of the linear chain, not a step every
task must wait on. None of these substitute for one another: plan-verifier's
MET/NOT MET table is not a quality opinion, architecture-reviewer's findings
are not a plan-completeness check, and neither performs a security review —
that agent doesn't exist in this repo yet.

## researcher

Read-only search agent for both repo-internal and external-source questions.
Never has `Write`/`Edit`, never invokes `/deep-research`, asks clarifying
questions first when the question or its scope is unclear. Returns one of two
report shapes (repository research vs. external source research) — see
`researcher.md` for the exact templates.

## planner

Turns a task into a Development Plan: scope/modules touched, architectural
constraints, relevant `INSIGHTS.md` entries, and — critically — which project
skills implementer will need, so the plan can't contradict a skill's own
rules. Read-only; delegates to `researcher` (only, via the `Agent(researcher)`
allow-list) for questions needing deeper repo or external research.

**Sources its rules are grounded on:**
- `.claude/skills/README.md` — skill catalog `Scope` column, used as the
  coarse pre-filter for "which skills apply"
- `.claude/skills/pr-self-review/SKILL.md` (step 2, "Match skills to files")
  — the skill-matching procedure planner reuses: Scope pre-filter, then
  confirm via each candidate's own "When to use" section
- `.claude/skills/onion-architecture/SKILL.md` — dependency rule / ring
  mapping for `server/`, `reviewer-core/`
- `.claude/skills/react-project-structure/SKILL.md` — where frontend code is
  allowed to live
- `.claude/skills/engineering-insights/SKILL.md` — `INSIGHTS.md` location
  (one per module) and format
- root `AGENTS.md` — do-not-touch vendored paths
  (`server/src/vendor/shared`, `client/src/vendor/shared`,
  `client/src/vendor/ui`)
- `TESTING.md` — suite map used for the plan's test section
- [Claude Code subagents docs](https://code.claude.com/docs/en/sub-agents) —
  frontmatter fields (`tools`, `model`), and the `tools: Agent(name, ...)`
  allow-list pattern used to restrict planner to spawning only `researcher`

## implementer

Executes a Development Plan across `client/` and `server/`/`reviewer-core/`,
applying project skills per file dynamically via the `Skill` tool (not
preloaded — the applicable set is task-dependent), running the touched
module's existing tests, and self-checking only that the result matches the
plan and that tests/typecheck pass. Explicitly does not run a skill-rule audit
or judge architecture/security — that's `pr-self-review` and the (not yet
built) review agents' job.

**Sources its rules are grounded on:**
- `server/AGENTS.md`, `client/AGENTS.md`, `reviewer-core/AGENTS.md`,
  `e2e/AGENTS.md` — per-module commands, do-not-touch paths, naming
  conventions implementer must follow while writing code
- `TESTING.md` — suite map and the unit/integration test-running conventions
  (e.g. `*.it.test.ts` split) implementer must use, not invent
- `.claude/skills/pr-self-review/SKILL.md` — clarifies the boundary: that
  skill (not implementer) runs the full skill-matched audit before a PR, so
  implementer's own self-check stays implementation-scoped only
- [Claude Code subagents docs](https://code.claude.com/docs/en/sub-agents) —
  tool-scoping via an explicit allow-list (`Write, Edit` included, no `Agent`
  — implementer never spawns other agents)
- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
  — basis for using the `Skill` tool dynamically per file rather than the
  subagent `skills:` preload field, since the applicable skill set varies by
  task instead of being fixed at agent-definition time

## test-writer

Writes and runs tests for `client/` and `server/`/`reviewer-core/` against
code that already exists, picking `react-testing-library` (frontend) or the
onion-architecture ring (backend: mock ports vs. real Postgres) per file it
touches. "Test files only" is a prompt-level discipline, not a tool
permission — Claude Code's `tools` frontmatter has no path-scoping mechanism,
only tool-name allow-lists.

**Sources:**
- `TESTING.md`, `server/AGENTS.md`, `client/AGENTS.md` — real commands and
  naming conventions (`*.it.test.ts`, colocated `*.test.tsx`)
- `.claude/skills/onion-architecture/rules/testing-boundaries.md` — which
  ring gets mocked vs. hit for real
- `.claude/skills/react-testing-library/SKILL.md` — testing-trophy
  philosophy, RTL query priority
- `.claude/skills/fastify-best-practices/rules/testing.md` — used with a
  caveat: its examples use `node:test`, this repo uses vitest; `TESTING.md`
  wins on conflict

## architecture-reviewer

Read-only audit of architectural boundaries only — the Onion dependency rule
for `server/`/`reviewer-core/`, component placement for `client/`. Reuses
this repo's own reviewer severity/verdict convention rather than inventing a
new scale.

**Sources:**
- `.claude/skills/onion-architecture/SKILL.md`,
  `rules/dependency-rule.md`, `rules/anti-patterns.md` (the violation
  checklist), `rules/enforcement.md` (optional dependency-cruiser follow-up)
- `.claude/skills/react-project-structure/SKILL.md`
- `docs/agent-prompts/README.md`, `docs/agent-prompts/general-reviewer.md`
  — the CRITICAL/WARNING/SUGGESTION + verdict-is-a-function-of-findings
  convention, carried over as-is for consistency across this repo's reviewer
  agents
- `.claude/skills/pr-self-review/SKILL.md` — PASS/BLOCKED verdict shape,
  scope-matching procedure
- [Claude Code Code Review docs](https://code.claude.com/docs/en/code-review)
  — external confirmation of the same pattern: severity tags, a false-positive
  verification step, and a `file:line`-citation bar instead of naming-based
  inference

## plan-verifier

A deterministic compliance gate: traces a Development Plan against the
actual code and re-run tests, item by item, MET/NOT MET — not a second
code-quality opinion.

**Sources:**
- `planner.md` / `implementer.md` — the Development Plan / Implementation
  Report shapes this agent reads as input
- `TESTING.md` — commands used to independently re-run tests rather than
  trust the Implementation Report's self-report
- [Skill authoring best practices — "Create verifiable intermediate outputs"](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
  — the plan→validate→execute→verify pattern this agent's role is modeled on
- [Requirements traceability](https://en.wikipedia.org/wiki/Requirements_traceability)
  — the general software-engineering term for plan/requirement ↔
  implementation verification
- [Atlassian: Acceptance Criteria](https://www.atlassian.com/work-management/project-management/acceptance-criteria)
  — basis for the binary MET/NOT MET status instead of a fuzzy "partially met"

## doc-writer

Documents shipped features (with diagrams) and can turn a Development Plan
into a spec, deciding where content belongs using this repo's existing
README vs. `docs/` vs. `specs/` split rather than a new structure.

**Sources:**
- `server/docs/README.md`, `client/docs/README.md` — "if it fits in the
  README without bloating it, put it there instead"; deep-dive/ADR framing
  for `docs/`
- `server/specs/README.md` — feature specs written before/alongside
  implementation
- `.claude/skills/mermaid-diagram/SKILL.md`
- [Diátaxis](https://diataxis.fr/) — the tutorial/how-to/reference/explanation
  framework that maps onto this repo's existing README vs. docs/ vs. specs/
  split
- [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
  — official recommendation to write a complete spec before implementing a
  larger feature, and to avoid duplicating content instead of linking to it
