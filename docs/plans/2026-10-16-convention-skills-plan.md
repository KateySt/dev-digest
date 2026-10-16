# Skills from Conventions: Implementation Plan

> **For agentic workers:** execute task by task (superpowers:executing-plans or the `run-plan`
> skill). Steps use checkbox (`- [ ]`) syntax. **No commits** unless the user asks.

**Goal:** Build several skills from one repo's conventions by selecting candidates with
checkboxes instead of changing their statuses. Each skill is created either for the
conventions' repo or globally. Used conventions show which skill they belong to.

**Spec:** `specs/2026-10-16-convention-skills.md` (SPEC-2026-10-16-convention-skills). `AC-n`
below refers to it.

**Architecture:** The new nullable `conventions.skill_id` column references `skills(id)` with
`ON DELETE SET NULL`. The new endpoint `POST /repos/:id/conventions/skill` lives in the
conventions module and works in this order:

1. Pre-check the request.
2. Run the skill scan through the shared `container.skillsService`, outside any transaction.
3. Open one transaction. Lock the conventions rows (`FOR UPDATE`), re-check them, insert the
   skill, and link the conventions.

On the client, `ConventionsView` is split into sections with local selection state, and the
modal gets a Scope select.

**Tech stack:** Fastify 5 + zod, Drizzle + Postgres (PGlite on desktop), Next.js 15 + React 19 +
TanStack Query v5 + next-intl, vitest (+ testcontainers for `*.it.test.ts`), JSON e2e flows.

## Global constraints

- `server/src/vendor/shared` and `client/src/vendor/shared` are identical copies. Apply every
  contract edit to **both**, then verify with `diff -r`.
- The migration is generated with `pnpm db:generate`, never hand-written. The new one is
  `0029_*`.
- The skill scan (an LLM call) never runs inside a DB transaction (AC-7).
- Use `container.skillsService`, never `new SkillsService(...)`, because its catalog cache
  must stay a singleton.
- Server: run tests with `pnpm exec vitest run …`, not `pnpm test`, which reinstalls deps.
  `*.it.test.ts` need Docker. If they skip, report that.
- Client: use `@/` alias imports, colocated tests, and load the `tanstack-query` skill before
  editing `lib/hooks/`.
- No new prompt text, so no `prompts.ts` change.

## Review focus

1. **Concurrent create over overlapping conventions** creates exactly one skill (AC-6). Pinned
   in Task 3: `concurrent requests: one skill, one 409`.
2. **The scan never runs inside the transaction.** Pinned in Task 3:
   `scan runs before transaction` (unit, with a spy order).
3. **Skill delete returns conventions to Ready** (AC-10). Pinned in Task 3:
   `deleting skill nulls skill_id, keeps accepted`.
4. **Rejecting a used convention is blocked** (AC-9). Pinned in Task 4.

---

### Task 1: Contracts (AC-1, AC-2, AC-8)

Files: `{server,client}/src/vendor/shared/contracts/knowledge.ts`.

- [ ] Add `ConventionSkillRef = z.object({ id, name, repo_id: z.string().nullable() })`.
- [ ] Add `ConventionCandidate.skill: ConventionSkillRef.nullable()`.
- [ ] Add `CreateSkillFromConventionsInput` and `CreateSkillFromConventionsResult`, using the
  shapes in the spec's "Contracts" section, with `convention_ids` as
  `z.array(z.string().uuid()).min(1).max(100)` and a uniqueness refine.
- [ ] Mirror the changes to both copies and confirm with
  `diff -r server/src/vendor/shared client/src/vendor/shared`.
- [ ] Fix the `ConventionCandidate` fixtures that typecheck flags (server tests, client tests,
  MCP `trimConvention` test).

### Task 2: Schema and migration

Files: `server/src/db/schema/knowledge.ts`, `server/src/db/migrations/0029_*`.

- [ ] Add `skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' })` to
  `conventions` (`skills` is already imported there), plus
  `index('conventions_skill_idx').on(t.skillId)`.
- [ ] Run `pnpm db:generate`. Check that the SQL only adds the column, the FK and the index.
- [ ] Run `pnpm db:migrate` locally.

### Task 3: Server create-from-conventions (AC-2…AC-7, AC-10, AC-11)

Files: `server/src/modules/conventions/{repository,service,helpers,routes}.ts`,
`server/src/modules/skills/{service,repository}.ts`.

- [ ] `SkillsRepository.insert(values, tx?)`: accept an optional transaction executor, the
  same pattern as `deleteById(…, tx)`.
- [ ] `SkillsService`: split `create` into a public
  `prepareCreate(workspaceId, input) → InsertSkill`, which does the repo-ownership check, name
  derivation and scan (AC-7), and the insert. `create` keeps its behaviour by calling
  `prepareCreate`, then `repo.insert`. Expose `insertPrepared(values, tx)` → `Skill`.
- [ ] `ConventionsRepository`:
  - `list` adds a left join to `skills` for `{ id, name, repoId }`.
  - `lockForSkill(workspaceId, repoId, ids, tx)` runs `SELECT … FOR UPDATE`.
  - `linkToSkill(ids, skillId, tx)`.
  - `unlink(workspaceId, id)`.
- [ ] `helpers.toConventionDto` maps `skill`.
- [ ] Add a pure `unavailableIds(rows, ids, repoId)` helper to `helpers.ts`. It returns
  `{ missing, unavailable }`, and is reused by the pre-check and the in-transaction check.
- [ ] `ConventionsService.createSkill(workspaceId, repoId, input)` runs these steps:
  1. Pre-check without a lock: missing ids → `NotFoundError`; not-accepted or linked ids →
     `ConflictError(…, { ids }, 'convention_unavailable')`.
  2. `prepareCreate` with `repoId: scope === 'repo' ? repoId : undefined`,
     `source: 'extracted'`.
  3. Open a `db.transaction`. Lock the rows and re-check them (a conflict throws, which rolls
     back). Then run `insertPrepared` and `linkToSkill`.
  4. Return `{ skill, conventions: await this.list(...) }`.
- [ ] Route: `POST /repos/:id/conventions/skill` with zod body
  `CreateSkillFromConventionsInput`.
- [ ] Tests:
  - Unit, `server/test/conventions-helpers.test.ts`: `unavailableIds` cases.
  - Unit: `scan runs before transaction`.
  - New `server/test/conventions-skill.it.test.ts`:
    - project scope / global scope (AC-3);
    - 404 on foreign repo or workspace (AC-4);
    - 409 on pending, rejected or already linked, with nothing written (AC-5);
    - concurrent requests: one skill, one 409 (AC-6);
    - deleting skill nulls `skill_id` and keeps it accepted (AC-10);
    - re-scan keeps used conventions (AC-11, with a mocked LLM).

### Task 4: Server unlink and status guard (AC-8, AC-9, AC-12)

Files: `server/src/modules/conventions/{routes,service}.ts`.

- [ ] `PatchConventionBody += skill_id: z.null().optional()`. Update the "no fields" check.
- [ ] `setStatus`: if the row has a `skill_id` and the new status is not `accepted`, throw
  `ConflictError(…, undefined, 'convention_in_use')`.
- [ ] `updateRule` is unchanged (AC-12 holds because the skill body is a snapshot).
- [ ] it-tests: unlink; reject-while-used → 409, unchanged; edit rule of used → skill body
  unchanged.
- [ ] Optional, the planner's default is to skip it: expose `skill` in MCP `trimConvention`.

### Task 5: Client hooks (AC-17, AC-18)

Files: `client/src/lib/hooks/conventions.ts` (load the `tanstack-query` skill first).

- [ ] `useCreateSkillFromConventions()` posts to `/repos/:id/conventions/skill`. `onSuccess`
  does `setQueryData(["conventions", repoId], result.conventions)` and
  `invalidateQueries(["skills"])`. `onError` with code `convention_unavailable` triggers
  `invalidateQueries(["conventions", repoId])`.
- [ ] `PatchConventionInput.patch += skill_id?: null`, used by Unlink.

### Task 6: Client page and modal (AC-13…AC-20)

Files: `client/src/app/conventions/_components/ConventionsView/**`, `client/messages/en/conventions.json`.

- [ ] `helpers.ts`:
  - Replace `acceptedCandidates` with a pure `groupConventions(list)`. It returns
    `{ ready, toReview, used: { skill, items }[], rejected }`.
  - Change `buildSkill*` to take the selected list.
  - Unit tests in `helpers.test.ts`.
- [ ] `ConventionsView`:
  - Hold `selected: Set<string>` in state, pruned to ids that are still in `ready` whenever
    the list changes.
  - Render the sections in AC-13 order. Rejected is collapsed.
  - Show the header button "Create skill (N)".
  - Remove `deselectAll` (AC-20).
- [ ] `ConventionCard`:
  - Add an optional `selectable` / `checked` / `onToggle`.
  - On a used card, hide Reject and Pending and show Unlink.
- [ ] New `_components/UsedSkillGroup/`: skill name linked to `/skills?id=<id>` (match the
  existing skills deep-link), a scope badge (`repo_id ? "Project" : "Global"`), and the cards.
- [ ] `CreateSkillModal`:
  - Add the props `repoId` and `selected`.
  - Add a Scope `Select` defaulting to `"repo"`, with a hint.
  - Submit through `useCreateSkillFromConventions`.
  - On 409, show an inline error and keep the modal open.
  - On success, clear the selection, close the modal and show a toast with the name and scope.
- [ ] Add the i18n keys `sections.*`, `selection.*`, `modal.scope.*`, `used.*`, and
  `errors.unavailable`.
- [ ] RTL tests:
  - `ConventionsView.test.tsx`: sections, selection doesn't call the API, button count and
    disabled state.
  - `CreateSkillModal.test.tsx`: default scope repo → `scope: "repo"` sent; Global →
    `scope: "global"`; 409 inline error.
  - `UsedSkillGroup.test.tsx`: link, badge, Unlink calls PATCH `{ skill_id: null }`.

### Task 7: e2e (AC-21)

Files: `e2e/specs/12-convention-skills.flow.json`, `e2e/specs/coverage.md`.

- [ ] Follow the existing flow format (see `10-memory.flow.json`). Seed or mock 3+
  conventions, then: accept 3, select 2, create a project skill, check "Used in skills", select
  1, create a global skill, check both skills on `/skills` with the right scope badges.
- [ ] Note in the report that runs on Windows take ~15 min (ports 5543/3201/3200).

### Task 8: Verification and docs

- [ ] Server: `pnpm exec tsc --noEmit`, plus unit and it-tests (report it-tests that Docker
  skipped).
- [ ] Client: `pnpm exec tsc --noEmit` and `pnpm exec vitest run`.
- [ ] Spec status: `draft` → `implemented`. Add a changelog line.
- [ ] Update `server/README.md` (API map) with the new endpoint, and the conventions hook doc
  comment.

## Task order

1 → 2 → 3 → 4 run in sequence (server). 5 → 6 (client) can start once Task 1 is done. 7 needs
3–6. 8 runs last.
