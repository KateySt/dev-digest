# Skills

Spec ID: SPEC-01
Status: implemented
Supersedes: none

A Skill is a reusable, text-only rule/rubric block (markdown `body`) that gets
attached to one or more Agents with an `order`. It cannot call tools or read
files — it is prompt text, nothing else.

## Attachment & ordering

`agent_skills` (owned by the `agents` module's repository, not `skills`)
links an agent to a skill with an integer `order`. The Agent editor's Skills
tab sets the whole ordered set at once (`POST /agents/:id/skills` with
`skill_ids`). Order matters: `assemblePrompt` joins enabled linked skills'
bodies in that order into one `## Skills / rules` block, placed right after
the (optional) PR description in the assembled user message
(`reviewer-core/src/prompt.ts`).

## Resolution happens per run, not at link time

`run-executor.ts` re-reads `agentsRepo.linkedSkills(agent.id)` on every run and
filters to `enabled` skills before passing bodies into `reviewPullRequest`.
Disabling a skill, or unlinking it, takes effect on the next run — nothing is
cached on the agent row. A failed/cancelled run's persisted trace has
`prompt_assembly.skills: null` (no prompt was ever assembled for it).

## Trust by `source`

`skills.source` records provenance and drives the default `enabled` state:

| source         | created by                        | default enabled |
|----------------|------------------------------------|------------------|
| `manual`       | created/edited in the Skill editor, or a **file** import | `true` |
| `imported_url` | server-side fetch of a URL         | `false` (needs vetting) |
| `community`    | imported from the fixture catalog  | `false` (needs vetting) |
| `extracted`    | accepted from a Conventions Lab candidate | n/a — not built by this feature |

A skill body is never delimiter-wrapped as `<untrusted>` data the way diff/PR-
description/specs are — it is meant to read as an instruction, not data. The
trust boundary is the `enabled` gate, not prompt-level wrapping: a human must
read and enable a non-`manual` skill before it affects any prompt.

## Versioning

`skills.version` bumps and a `skill_versions` row is snapshotted only when
`body` changes (not on cosmetic edits like `name`/`description`/`type`,
unlike agents where any config field bumps the version).
