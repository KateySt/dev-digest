# Spec: Skills from Conventions   |   Spec ID: SPEC-2026-10-16-convention-skills   |   Status: implemented
Builds on: the Conventions Lab (`server/src/modules/conventions`, `/conventions` page) and
project-scoped skills (`server/specs/community-catalog.md`, SPEC-07: `skills.repo_id`, null =
global).

## Problem & why

The Conventions page lets the user turn convention candidates into a skill, but two things
get in the way:

1. **The `accepted` status means two things.** It means "this is a real rule of the codebase",
   and it is also the only way to choose which candidates go into a skill: the **Create skill**
   button merges *every* accepted candidate. To build a second skill from other candidates,
   the user has to un-accept (or reject) the ones already used and accept the new ones. That
   throws away curation work. "Deselect all" also resets statuses to `pending`.
2. **Skills from conventions are always global.** `CreateSkillModal` never sends `repo_id`,
   so a skill made from one repo's conventions applies to every project. The server already
   supports project scope (`POST /skills` accepts `repo_id`); the client just does not send it.

Nothing records which convention went into which skill. After a skill is created, the page
looks the same as before.

## Decisions (from the design dialog, 2026-10-16)

- **Selecting is separate from status.** `accepted` / `rejected` / `pending` keep meaning
  curation only. Choosing candidates for a skill is a checkbox on the page, held in client
  state and never saved.
- **A convention records the skill it was used in** (`conventions.skill_id`, nullable). A
  convention that is used in a skill keeps the status `accepted`. "Used" is derived from
  `skill_id`; it is not a new status value.
- **One convention, at most one skill.** A used convention is not offered for the next skill.
  To reuse it, the user unlinks it first.
- **Nothing is deleted.** Used conventions stay. They are the provenance of the skill, they
  stay visible to MCP `get_conventions`, and keeping them stops a re-scan from re-proposing
  the same rules as new `pending` candidates.
- **Deleting a skill returns its conventions** to the "ready" state (`ON DELETE SET NULL`).
- **The skill body is a snapshot.** Editing a used convention's rule later does not change
  the skill, and editing the skill does not change the conventions.
- **Scope is chosen at creation time:** "This project" (the repo the conventions belong to,
  the default) or "Global". No other repo can be chosen here.

## Goals / Non-goals

- Goal: build several skills from one repo's conventions, one selection at a time, without
  changing any status.
- Goal: each new skill is created either for the conventions' repo or globally, as the user
  chooses.
- Goal: the page shows which conventions are already used and in which skill.
- Non-goal: one convention in several skills (no join table).
- Non-goal: syncing a skill's body when its conventions change, or the reverse.
- Non-goal: deduplicating a re-scan's new candidates against existing ones (a known gap,
  unchanged by this spec).
- Non-goal: global (repo-less) conventions. Conventions stay per repo.
- Non-goal: changes to MCP `get_conventions` beyond what the contract change carries
  through automatically.

## User stories

- As a user, I accept 6 candidates, tick 2 of them and create the skill "API errors" for
  this project. Those 2 move to "Used in skills". Then I tick 3 of the remaining 4 and create
  a global skill "Naming". The statuses never change.
- As a user, I delete the skill "API errors". Its 2 conventions return to "Ready" and I can
  use them again.
- As a user, I unlink one convention from a skill so that I can put it in a different skill.

## Domain model changes

- `conventions.skill_id uuid NULL REFERENCES skills(id) ON DELETE SET NULL`, with an index.
  It is null for every existing row (additive change, no backfill).
- A convention's **state on the page** is derived as follows:
  - `pending` → **To review**
  - `rejected` → **Rejected**
  - `accepted` and `skill_id IS NULL` → **Ready**
  - `accepted` and `skill_id IS NOT NULL` → **Used** (in the skill `skill_id` points at)
- Invariant: `skill_id IS NOT NULL` implies `status = 'accepted'`.

## Acceptance criteria

### Server

- **AC-1**: `GET /repos/:id/conventions` SHALL return each candidate with a `skill` field:
  `{ id, name, repo_id }` of the linked skill, or `null`. *[it-test]*
- **AC-2**: The server SHALL expose `POST /repos/:id/conventions/skill` with the body
  `{ convention_ids: string[] (1..100, unique UUIDs), name, description?, type, body,
  enabled?, scope: 'repo' | 'global' }`. On success it SHALL create one skill with
  `source: 'extracted'` and link every listed convention to it, and return
  `{ skill, conventions }` (`conventions` = the repo's full updated list). *[it-test]*
- **AC-3**: WHEN `scope` is `'repo'`, the skill SHALL get `repo_id` = the route's repo id.
  WHEN `scope` is `'global'`, the skill SHALL get `repo_id = null`. *[it-test]*
- **AC-4**: IF any listed convention does not exist, belongs to another workspace, or
  belongs to another repo, THEN the server SHALL return 404 and write nothing. *[it-test]*
- **AC-5**: IF any listed convention is not `accepted`, or already has a `skill_id`, THEN the
  server SHALL return 409 `convention_unavailable` with the offending ids, and write nothing.
  *[it-test]*
- **AC-6**: The skill insert and the conventions link SHALL happen in one transaction that
  re-checks AC-5 under a row lock. Two concurrent requests for overlapping conventions SHALL
  result in exactly one skill; the other request gets 409 and creates no skill. *[it-test]*
- **AC-7**: The skill's content scan (the existing `skill_scan` LLM call) SHALL run before the
  transaction opens, never while it holds locks. The scan result SHALL apply the same way as
  in `POST /skills` (a blocking scan forces `enabled = false`). *[unit]*
- **AC-8**: `PATCH /conventions/:id` SHALL accept `{ skill_id: null }` to unlink a
  convention. Linking to a skill through `PATCH` SHALL NOT be possible. *[it-test]*
- **AC-9**: IF a `PATCH` changes the status of a convention that has a `skill_id` to anything
  other than `accepted`, THEN the server SHALL return 409 `convention_in_use` and change
  nothing. *[it-test]*
- **AC-10**: WHEN a skill is deleted, every convention linked to it SHALL get
  `skill_id = null` and keep the status `accepted`. *[it-test]*
- **AC-11**: A re-scan (`POST /repos/:id/conventions/extract`) SHALL NOT delete or modify a
  used convention. This already holds, because used conventions are `accepted`. *[it-test]*
- **AC-12**: Editing a used convention's `rule` SHALL succeed and SHALL NOT change the
  linked skill. *[it-test]*

### Client (`/conventions`)

- **AC-13**: The list SHALL be grouped into sections, in this order: **Ready**, **To review**,
  **Used in skills**, **Rejected**. Empty sections are hidden. **Rejected** is collapsed by
  default. *[rtl]*
- **AC-14**: Every **Ready** card SHALL have a selection checkbox. The section header SHALL
  offer **Select all** / **Clear**. The selection SHALL live in component state only and
  SHALL NOT call any API. *[rtl]*
- **AC-15**: The **Create skill** button SHALL show the selected count, be disabled when
  nothing is selected, and open the modal with exactly the selected conventions. *[rtl]*
- **AC-16**: The modal SHALL include a **Scope** select with "This project (`owner/name`)"
  (the default) and "Global (all projects)", plus a one-line hint about what each option
  means. *[rtl]*
- **AC-17**: On submit, the client SHALL call `POST /repos/:id/conventions/skill`. On success
  it SHALL clear the selection, refresh the conventions list and the skills lists, close the
  modal and show a toast naming the skill and its scope. *[rtl]*
- **AC-18**: On a 409 `convention_unavailable`, the modal SHALL stay open with an inline
  error, and the client SHALL refetch the conventions list. Already-unavailable conventions
  drop out of the selection. *[rtl]*
- **AC-19**: **Used in skills** SHALL group conventions by skill. Each group SHALL show the
  skill name as a link to that skill, a scope badge ("Project" or "Global") and an **Unlink**
  action on each convention. *[rtl]*
- **AC-20**: The old **Deselect all** action, which reset accepted candidates to `pending`,
  SHALL be removed. Accept and Reject on a card keep working as before. On a used card, Reject
  and Pending are not offered; the user has to unlink it first. *[rtl]*
- **AC-21**: A browser journey SHALL cover: accept 3 → select 2 → create a project skill →
  the 2 cards appear under "Used in skills" → select the remaining 1 → create a global skill.
  *[e2e]*

## Edge cases

- **Repo removed:** conventions cascade with the repo, and a project skill cascades with the
  repo too. A global skill made from them survives with no conventions linked.
- **The skill is moved to another project or to global later** (Skills page): the link stays.
  The page shows the skill's current scope.
- **A skill is created from conventions, then its body is edited until it says nothing about
  them:** the link stays. The user unlinks by hand. There is no content tracking.
- **A selection becomes stale because another tab used the same conventions:** handled by
  AC-5, AC-6 and AC-18.
- **Scope "This project" when the active repo changes while the modal is open:** the modal
  is bound to the repo it was opened for. Changing the active repo closes it.

## Non-functional requirements

- No additional LLM calls: the only LLM call is the existing skill scan.
- `convention_ids` are capped at 100 per request.
- The migration is additive and nullable, and needs no backfill. The desktop PGlite migration
  path is unaffected.

## Module interactions

- `conventions` → `skills`: the new endpoint lives in the conventions module and uses
  `container.skillsService` (the shared instance) to validate and scan, and the skills
  repository to insert inside the transaction.
- `skills` delete → `conventions`: handled by the database (`ON DELETE SET NULL`). No code
  coupling.
- `mcp` `get_conventions`: it serializes through `trimConvention`. Whether to expose `skill`
  there is left to the planner. The default is not to.

## Contracts (sketch)

```ts
ConventionCandidate += { skill: { id: string; name: string; repo_id: string | null } | null }
CreateSkillFromConventionsInput = {
  convention_ids: string[]; name: string; description?: string; type: SkillType;
  body: string; enabled?: boolean; scope: 'repo' | 'global';
}
CreateSkillFromConventionsResult = { skill: Skill; conventions: ConventionCandidate[] }
PatchConvention += { skill_id?: null }
```

## Changelog

- 2026-10-16: implemented (plan `docs/plans/2026-10-16-convention-skills-plan.md`).
  Implementation notes: migration `0029_tidy_madame_hydra`; `SkillsService.create`
  split into `prepareCreate` (ownership check + scan) and `insertPrepared(values, tx)`;
  `POST /repos/:id/conventions/skill` returns 201 like `POST /skills`; MCP
  `get_conventions` left unchanged (the planner's default). The seed now adds three
  pending candidates to `acme/payments-api` (only while the repo has none) so e2e
  flow 12 is deterministic.
- 2026-10-16: initial version.
