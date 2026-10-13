# Memory & Learn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **No commits.** The user asked that nothing be committed: leave every change in the working tree on `feat/add-memory`. There are no commit steps.

**Goal:** Learn on a finding → human-confirmed memory → relevant memories injected into future reviews, plus a Memory page to manage them.

**Architecture:** A new server module `modules/memory/` owns CRUD, the Learn draft (one LLM call), the write-time duplicate check, and run-time retrieval (filter → rank → token budget). `run-executor.ts` asks it for memories and passes them to `reviewPullRequest`. reviewer-core renders them in a `<team-memory>` block with a fixed usage preamble. The client gets a Learn modal on `FindingCard` and a real Memory page. CI export writes `memory.jsonl` from the same retrieval filter.

**Tech Stack:** Fastify 5 + zod type provider, Drizzle + Postgres/pgvector (PGlite on desktop), reviewer-core (pure TS), Next.js 15 + React 19 + TanStack Query v5 + next-intl, vitest (+ testcontainers for `*.it.test.ts`), JSON e2e flows.

**Spec:** `specs/2026-10-12-memory.md` (SPEC-2026-10-12-memory, approved). AC-N ids below refer to it.

## Global Constraints

- Memory content: 1–600 chars after trim. Max 10 path globs per memory.
- Scopes accepted by the API: `repo` (requires `repo_id`) and `global` (`repo_id` null). `team` is rejected (400) and never shown.
- Kinds: `decision`, `convention`, `preference`, `fact`, `learning`.
- Injection budget: `MEMORY_TOKEN_BUDGET = 1500` tokens, `MEMORY_MAX_ENTRIES = 20`; drop whole entries, never truncate one.
- Similarity threshold for the duplicate check: cosine ≥ `0.88` (embeddings on); `ts_rank` ≥ `MEMORY_FTS_DUP_THRESHOLD` (embeddings off, builder picks the value; start at `0.1`). Max 3 similar results.
- Stale = `coalesce(last_used_at, created_at)` older than 60 days. UI marker only; never affects injection.
- Learn draft timeout: 10 s, then a deterministic fallback draft.
- Memory never goes into eval runs or skill-eval runs.
- Must work with `EMBEDDINGS_ENABLED=false` and on PGlite (desktop). Full-text uses built-in `tsvector` (no `pg_trgm`).
- Prompt text lives in `modules/memory/prompts.ts` (server) and `reviewer-core/src/prompt.ts` (preamble), never inline in a service.
- Server module filenames: `routes.ts`, `service.ts`, `repository.ts`, `constants.ts`, `helpers.ts`, `prompts.ts`, plus `retrieval.ts`.
- Client: `@/` alias imports only; colocated `*.test.tsx`; load the `tanstack-query` skill before writing hooks.
- `server/src/vendor/shared` and `client/src/vendor/shared` are identical copies: apply every contract edit to **both** byte-for-byte (verify with `diff -r`).
- Migrations are generated (`pnpm db:generate`), never hand-written after commit; the new migration is `0026_*`.
- `agent-runner/bundle/runner.mjs` is a committed artifact: rebuild it (`pnpm build` in `agent-runner/`) after changing runner source.

## Review Focus

1. **A CRITICAL finding covered by a `learning` memory** — the reviewer must still report it. Pinned by the preamble test in Task 3 and an assertion that the preamble contains "CRITICAL".
2. **Memory content containing `</team-memory>` or "ignore previous instructions"** — must not escape the block. Pinned in Task 3 (`escapes closing tag`).
3. **Memory linked to a skill that is disabled or scan-blocked** — must not be injected (same filter as skills in `run-executor.ts:319`). Pinned in Task 7 (`skips memories linked only to a disabled skill`).
4. **Embeddings enabled, but the embedding call throws** (no OpenAI key, network) — save and review must both still succeed via full-text. Pinned in Task 5 (`saves with null embedding when embed throws`) and Task 7 (`falls back to fts when query embedding fails`).
5. **Deleting the agent that a memory is linked to** — the memory becomes "Unlinked", not deleted, and is never injected. Pinned in Task 4 (`agent delete leaves memory unlinked`).

---

### Task 1: Shared contracts

**Files:**
- Modify: `server/src/vendor/shared/contracts/knowledge.ts:112-138` (Memory section)
- Modify: `server/src/vendor/shared/contracts/trace.ts:75-79` (`MemoryPulled`)
- Modify: `server/src/vendor/shared/contracts/review-api.ts` (`FindingRecord` + `memory_id`)
- Modify: `server/src/vendor/shared/contracts/platform.ts:14-23` (`FeatureModelId` + `'memory'`, and its registry entry near `:75`)
- Mirror all four into `client/src/vendor/shared/contracts/`
- Test: `server/test/contracts.test.ts`

**Interfaces — Produces** (all exported from `@devdigest/shared`):
- `MemoryInputScope = z.enum(['repo','global'])`
- `MemoryLink = z.object({ target_kind: z.enum(['agent','skill']), target_id: z.string().uuid() })`
- `MemorySource` grows: `{ pr?: number|null, context: string, finding_id?: string|null, review_id?: string|null, agent_id?: string|null, created_by?: string|null, created_at?: string }`
- `MemoryInput = z.object({ content: z.string().trim().min(1).max(600), kind: MemoryKind, scope: MemoryInputScope, repo_id: z.string().uuid().nullable(), path_globs: z.array(z.string().min(1)).max(10).default([]), links: z.array(MemoryLink).default([]), applies_to_all_agents: z.boolean().default(false), confidence: z.number().min(0).max(1).default(0.8) })`
- `Memory = MemoryItem.extend({ id, repo_id: string|null, path_globs: string[], links: (MemoryLink & { name: string })[], applies_to_all_agents: boolean, unlinked: boolean, created_at, updated_at, last_used_at: string|null, archived_at: string|null, stale: boolean })`
- `MemorySummary = z.object({ id, content, kind, scope, similarity: z.number() })`
- `MemoryDraft = MemoryInput.extend({ fallback: z.boolean() })` (true when AC-5 fallback was used)
- `LearnDraftResponse = z.object({ draft: MemoryDraft, source: MemorySource, similar: z.array(MemorySummary), existing_memory_id: z.string().uuid().nullable() })`
- `CreateMemoryBody = MemoryInput.extend({ finding_id: z.string().uuid().optional() })`
- `MergeMemoryBody = z.object({ content: MemoryInput.shape.content, confidence: z.number().min(0).max(1), finding_id: z.string().uuid().optional() })`
- `MemoryListQuery = z.object({ repo_id: uuid.optional(), scope: MemoryInputScope.optional(), kind: MemoryKind.optional(), stale: z.coerce.boolean().default(false), archived: z.coerce.boolean().default(false), q: z.string().max(200).optional() })`
- `MemoryListResponse = z.object({ items: z.array(Memory), counts: z.object({ scope: z.record(z.number()), kind: z.record(z.number()) }), search_mode: z.enum(['semantic','text']) })`
- `MemoryPulled` grows to `{ id: string, kind: MemoryKind, pr: number|null|undefined, text: string, source_prs: number[] }` — `id`/`kind`/`source_prs` `.nullish()` so old traces still parse.
- `FindingRecord.memory_id: z.string().uuid().nullish()`

- [ ] **Step 1: Write failing tests** in `server/test/contracts.test.ts`: `MemoryInput rejects 601-char content`, `MemoryInput rejects scope team`, `MemoryInput rejects 11 globs`, `MemoryPulled parses a legacy {pr,text} entry`, `FindingRecord accepts missing memory_id`.
- [ ] **Step 2: Run** `cd server && pnpm exec vitest run test/contracts.test.ts` → FAIL (schemas undefined).
- [ ] **Step 3: Add the schemas above** to the server copy, then copy the four files to `client/src/vendor/shared/contracts/`.
- [ ] **Step 4: Verify** `cd server && pnpm exec vitest run test/contracts.test.ts` → PASS; `diff -r server/src/vendor/shared client/src/vendor/shared` → no output; `pnpm typecheck` in `server/` and `client/` → clean.

Cross-field rules (`repo` needs `repo_id`, at least one link or all-agents) are **not** in zod; they live in Task 4's `validateMemoryInput` so they return one clear 400.

---

### Task 2: Schema + migration

**Files:**
- Modify: `server/src/db/schema/knowledge.ts:9-30` (`memory`), add `memoryLinks` in the same file
- Modify: `server/src/db/schema/reviews.ts:28-49` (`findings.memoryId`)
- Create: `server/src/db/migrations/0026_*.sql` via `pnpm db:generate`
- Test: `server/test/memory-pglite.test.ts`

**Interfaces — Produces:**
- `memory` new columns: `pathGlobs text[] not null default '{}'`, `appliesToAllAgents boolean not null default false`, `archivedAt timestamptz null`, `contentTsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED`.
- `memoryLinks` table: `id uuid pk`, `memoryId → memory.id ON DELETE CASCADE`, `agentId → agents.id ON DELETE CASCADE nullable`, `skillId → skills.id ON DELETE CASCADE nullable`, `check (num_nonnulls(agent_id, skill_id) = 1)`, unique `(memory_id, agent_id)` and `(memory_id, skill_id)`.
- `findings.memoryId uuid → memory.id ON DELETE SET NULL`.
- Indexes: `memory_ws_repo_idx (workspace_id, repo_id)`, `memory_embedding_hnsw` `USING hnsw (embedding vector_cosine_ops)`, `memory_tsv_gin USING gin (content_tsv)`, `memory_links_agent_idx`, `memory_links_skill_idx`.

Drizzle can't express the generated tsvector or HNSW opclass cleanly. If `db:generate` can't emit them, generate the migration first and then add those statements to the **new, not-yet-applied** `0026` file before anyone runs it. That is allowed, because the rule only forbids editing committed or applied migrations.

- [ ] **Step 1: Write the failing test** `memory-pglite.test.ts`: create an in-memory PGlite via `createPgliteDb` from `server/src/db/pglite.ts` in a tmp dir, call `runPgliteMigrations(pg, 'src/db/migrations')`, then assert: `pg_indexes` contains `memory_embedding_hnsw` and `memory_tsv_gin`; inserting a memory row and selecting `content_tsv @@ plainto_tsquery('english','bucket')` returns it.
- [ ] **Step 2: Run** `cd server && pnpm exec vitest run test/memory-pglite.test.ts` → FAIL (index missing).
- [ ] **Step 3: Edit the schema, run `pnpm db:generate`**, add the generated column + HNSW + GIN statements if missing.
- [ ] **Step 4: Verify** the PGlite test → PASS; `pnpm db:migrate` against docker Postgres → applies cleanly; `pnpm typecheck` → clean.

---

### Task 3: reviewer-core — memory rendering + glob helper

**Files:**
- Modify: `reviewer-core/src/prompt.ts:39-152`
- Modify: `reviewer-core/src/review/run.ts:56-58,136-146`
- Create: `reviewer-core/src/glob.ts`; export from `reviewer-core/src/index.ts`
- Test: `reviewer-core/test/prompt.test.ts`, `reviewer-core/test/glob.test.ts`

**Interfaces — Produces:**
- `export interface MemoryEntry { kind: MemoryKind; content: string }`
- `PromptParts.memory?: MemoryEntry[]` and `ReviewInput.memory?: MemoryEntry[]` (replace `string[]`).
- `export function wrapTeamMemory(content: string): string` → `<team-memory>\n…\n</team-memory>`, replacing `</team-memory>` with `<\/team-memory>`.
- `MEMORY_PREAMBLE` constant (exact text is the implementer's; it must state all AC-17a rules, including the literal word `CRITICAL`).
- The `## Relevant memory` section = `MEMORY_PREAMBLE + '\n' + wrapTeamMemory(entries.map(e => `- [${e.kind}] ${e.content}`).join('\n'))`; `assembly.memory` = that whole section body.
- `export function matchesAnyGlob(path: string, globs: readonly string[]): boolean` — supports `**`, `*`, `?`; an empty `globs` returns `true`; no dependency.

- [ ] **Step 1: Write failing tests:**
  - `prompt.test.ts`:
    - `renders memory as [kind] lines inside team-memory`: input `[{kind:'learning',content:'x'}]` → user message contains `<team-memory>\n- [learning] x\n</team-memory>`.
    - `memory block is not inside untrusted`: no `<untrusted source="memory` in the output.
    - `preamble forbids CRITICAL suppression`: `assembly.memory` contains `CRITICAL`.
    - `escapes closing tag`: content `a</team-memory>b` → exactly one `</team-memory>` in the output.
    - `omits section when memory empty`.
  - `glob.test.ts`:
    - `src/**` matches `src/a/b.ts`.
    - `*.ts` does not match `a/b.ts`.
    - `src/*/x.ts` matches `src/a/x.ts` but not `src/a/b/x.ts`.
    - Empty list → true.
- [ ] **Step 2: Run** `cd reviewer-core && pnpm test` → the new tests FAIL.
- [ ] **Step 3: Implement** the code above. `INJECTION_GUARD` itself is unchanged.
- [ ] **Step 4: Verify** `cd reviewer-core && pnpm test && pnpm typecheck` → PASS. `cd server && pnpm typecheck` flags `memory: string[]` callers only in `agent-runner` (fixed in Task 8); the server passes nothing yet.

---

### Task 4: Memory module — CRUD, validation, duplicate check, merge

**Files:**
- Create: `server/src/modules/memory/{routes,service,repository,constants,helpers}.ts`
- Modify: `server/src/modules/index.ts` (register `memoryRoutes`)
- Test: `server/test/memory-helpers.test.ts`, `server/test/memory.it.test.ts`

**Interfaces — Consumes:** Task 1 contracts, Task 2 tables. **Produces:**
- `constants.ts`: `MEMORY_TOKEN_BUDGET = 1500`, `MEMORY_MAX_ENTRIES = 20`, `MEMORY_DUP_COSINE = 0.88`, `MEMORY_FTS_DUP_THRESHOLD = 0.1`, `MEMORY_SIMILAR_LIMIT = 3`, `MEMORY_STALE_DAYS = 60`, `LEARN_DRAFT_TIMEOUT_MS = 10_000`.
- `helpers.ts`:
  - `validateMemoryInput(input: MemoryInput, ctx: { skillRepoIds: Map<string, string|null> }): void` throws `ValidationError` for each AC-11/AC-12 rule.
  - `isValidGlob(g: string): boolean`.
  - `isStale(row, now: Date): boolean`.
  - `memoryRowToDto(row, links, now): Memory`.
- `MemoryRepository` (`repository.ts`):
  - `list(workspaceId, query: MemoryListQuery, now)`, `get(workspaceId, id)`, `insert(...)`, `update(...)`, `delete(...)`, `setLinks(memoryId, links)`, `appendSource(id, source, content, confidence)`.
  - `similarByEmbedding(workspaceId, repoId|null, vec, limit)` and `similarByText(workspaceId, repoId|null, text, limit)`, each returning `MemorySummary[]` above the threshold.
  - `touchLastUsed(ids: string[], at: Date)`.
- `MemoryService` (`service.ts`):
  - `list`, `get`, `create(workspaceId, userId, body: CreateMemoryBody)`, `update(workspaceId, id, patch)`, `archive(workspaceId, id, archived: boolean)`, `remove(workspaceId, id)`, `merge(workspaceId, userId, id, body: MergeMemoryBody)`, `similar(workspaceId, content, repoId|null)`.
  - On `create` with a `finding_id`, the service also sets `findings.memory_id`. If that finding already has a memory, it returns 409 `already_learned`.
- Routes (all `getContext` → `workspaceId`, `userId`):
  - `GET /memories` (query `MemoryListQuery`), `GET /memories/:id`.
  - `POST /memories` (`CreateMemoryBody`), `PATCH /memories/:id` (`MemoryInput.partial().extend({ archived: z.boolean().optional() })`), `DELETE /memories/:id`.
  - `POST /memories/:id/merge` (`MergeMemoryBody`), `GET /memories/similar?content&repo_id`.

The `list` search uses `q`: semantic when `container.embedder()` resolves (order by `embedding <=> $vec`), otherwise `content_tsv @@ plainto_tsquery` ordered by `ts_rank`. The response reports `search_mode` accordingly. Counts ignore the `kind`/`scope` filter they describe (facet counts).

- [ ] **Step 1: Write failing unit tests** `memory-helpers.test.ts`:
  - **Validation:** one test per AC-11 rule (`rejects global with repo_id`, `rejects repo without repo_id`, `rejects no links and not all-agents`, `rejects invalid glob "src/[" `).
  - **AC-12:** `rejects repo memory linked to skill of other repo`, `allows repo memory linked to global skill`.
  - **Staleness:** `isStale true at 61 days, false at 59, uses created_at when never used`.
- [ ] **Step 2: Write failing integration tests** `memory.it.test.ts`, using the existing `test/helpers/pg.ts` testcontainers harness and `MockEmbedder` from `adapters/mocks.ts`:
  - **CRUD:** `create → list → get round-trip`; `PATCH archived hides from default list, shows with archived=true`; `DELETE removes`; `team scope → 400`.
  - **Links:** `agent delete leaves memory unlinked` (`unlinked: true`, row still exists).
  - **Duplicates and merge:** `similar returns ≤3 above threshold (fts path, embeddings disabled)`; `merge appends source, replaces content, confidence = max, no new row`.
  - **Finding link:** `create with finding_id sets findings.memory_id; second create for same finding → 409`.
  - **Search:** `list q uses text mode when embeddings disabled` (`search_mode === 'text'`).
- [ ] **Step 3: Run** `cd server && pnpm exec vitest run test/memory-helpers.test.ts` and `pnpm exec vitest run test/memory.it.test.ts` → FAIL.
- [ ] **Step 4: Implement** the module, following the conventions module's structure (`conventions/routes.ts` style: zod `schema`, `getContext`, service per plugin).
- [ ] **Step 5: Verify** both test files → PASS; `pnpm typecheck` → clean.

---

### Task 5: Embeddings on write

**Files:**
- Modify: `server/src/modules/memory/service.ts`
- Test: `server/test/memory.it.test.ts` (extend)

**Interfaces — Produces:** `MemoryService.embedOrNull(text: string): Promise<number[] | null>`. It calls `container.embedder()` and returns `null` on any throw (disabled or failing); it never throws. `create`, `merge` and content-changing `update` store the vector or null. `similar` and `list` call it for the query vector.

- [ ] **Step 1: Write failing tests:**
  - `stores embedding when embedder injected`: use a `MockEmbedder` override; the row's `embedding` is not null.
  - `saves with null embedding when embed throws`: use an embedder override whose `embed` rejects; the create still returns 200 and `embedding` is null.
  - `similar uses cosine path when embeddings on`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm exec vitest run test/memory.it.test.ts` → PASS.

Backfill of old rows when embeddings get turned on is lazy: `similar`/`list`/retrieval treat a null embedding as text-ranked (Task 7). No backfill job is part of this plan.

---

### Task 6: Learn draft

**Files:**
- Create: `server/src/modules/memory/prompts.ts`
- Modify: `server/src/modules/memory/{service,routes,helpers}.ts`
- Modify: `server/src/modules/settings/feature-models.ts` (`memory` default = same cheap default as `conventions`)
- Modify: `server/src/modules/reviews/helpers.ts:38-64` (`memory_id: row.memoryId ?? null`)
- Modify: `server/src/modules/reviews/findings.ts:7-10` (doc comment: Learn lives in `modules/memory`)
- Test: `server/test/learn-draft.it.test.ts`, `server/test/memory-helpers.test.ts` (extend)

**Interfaces — Produces:**
- `prompts.ts`: `LEARN_DRAFT_SYSTEM_PROMPT` (generalize the finding into a rule + why, ≤ 600 chars; suggest kind, a path glob or none, and confidence) and `LEARN_DRAFT_SCHEMA_NAME`.
- `helpers.ts`:
  - `defaultDraftKind(f: { acceptedAt, dismissedAt }): 'learning' | 'fact'` → dismissed gives `learning`, otherwise `fact`.
  - `fallbackDraft(f, pr, agentId): MemoryDraft` → content = `${title}: ${rationale}` truncated to 600, `fallback: true`.
- `MemoryService.draftFromFinding(workspaceId, findingId): Promise<LearnDraftResponse>`:
  - Loads the finding via `ReviewRepository.findingContext`; returns 404 if it's in another workspace.
  - If `finding.memoryId` is set, it returns `existing_memory_id`, skips the LLM call, and sets `draft` from the existing memory.
  - Otherwise it calls `completeStructured`, racing it against `LEARN_DRAFT_TIMEOUT_MS`, with the model from `resolveFeatureModel(container, ws, 'memory')`.
  - On any error it uses `fallbackDraft`.
  - Defaults:
    - `scope: 'repo'` and `repo_id` = the PR's repo;
    - `links` = `[{target_kind:'agent', target_id: review.agentId}]`;
    - if the agent was deleted, `applies_to_all_agents: true` and an empty `links`.
  - `similar` comes from `this.similar(...)`.
  - Writes nothing (AC-6).
- Route: `POST /findings/:id/learn/draft` (registered in `memory/routes.ts`).

- [ ] **Step 1: Write failing unit tests:**
  - `defaultDraftKind dismissed→learning, accepted→fact, undecided→fact`;
  - `fallbackDraft truncates to 600 and sets fallback`.
- [ ] **Step 2: Write failing integration tests** `learn-draft.it.test.ts`, using the mock LLM via `ContainerOverrides.llm`:
  - `draft returns LLM content, repo scope, producing agent link`;
  - `draft writes no memory rows`;
  - `draft falls back when LLM throws` (`fallback === true`);
  - `draft for learned finding returns existing_memory_id`;
  - `finding DTO exposes memory_id after create`;
  - `learn does not change accepted_at/dismissed_at` (AC-8).
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** both files → PASS; `pnpm typecheck` → clean.

---

### Task 7: Retrieval + injection into review runs + trace

**Files:**
- Create: `server/src/modules/memory/retrieval.ts`
- Modify: `server/src/modules/reviews/run-executor.ts:316-382` (resolve + pass `memory`), `:447` and `:628` (`memory_pulled`)
- Test: `server/test/memory-retrieval.test.ts` (unit), `server/test/memory-retrieval.it.test.ts`

**Interfaces — Consumes:** `matchesAnyGlob`, `MemoryEntry` (Task 3); `MemoryRepository` (Task 4); `embedOrNull` (Task 5). **Produces:**
- `export interface MemoryRunContext { workspaceId: string; repoId: string; agentId: string; skillIds: string[]; changedFiles: string[]; queryText: string; model: string }`
- `export interface ResolvedMemory { entries: MemoryEntry[]; pulled: MemoryPulled[]; ids: string[] }`
- `export class MemoryRetriever { constructor(container: Container); resolveForRun(ctx: MemoryRunContext): Promise<ResolvedMemory> }`
- `export function selectWithinBudget(ranked: { id: string; kind: MemoryKind; content: string }[], countTokens: (s: string) => number, budget: number, maxEntries: number): typeof ranked` (pure, in `retrieval.ts`)
- `export function buildQueryText(prTitle: string, files: string[], diffRaw: string): string`. It truncates `diffRaw` to 4,000 chars.

Algorithm:
1. **Load candidates** with SQL:
   - `workspace_id = ws`, `archived_at IS NULL`, and `(scope='global' OR repo_id = repoId)`;
   - `(applies_to_all_agents OR EXISTS link agent_id = agentId OR EXISTS link skill_id = ANY(skillIds))`.
2. **Filter by glob** in JS: `matchesAnyGlob` against each of `changedFiles`.
3. **Rank:**
   - If the query embedding is non-null, use cosine; rows with a null embedding get similarity 0.
   - Otherwise use `ts_rank`.
   - Tie-break: glob-matched first, then `confidence` desc, then `updated_at` desc.
4. **Budget:** apply `selectWithinBudget(…, (s) => container.tokenizer.countFor(model, s), MEMORY_TOKEN_BUDGET, MEMORY_MAX_ENTRIES)`.
5. **Mark as used:** `touchLastUsed(ids, now)`.

`skillIds` = the same enabled, non-scan-blocked `linkedSkills` already computed at `run-executor.ts:319-322` (refactor it to keep the ids, not just the bodies).

In `run-executor.ts`:
- Wrap `resolveForRun` in `try/catch`. On error, log `memory: retrieval failed — …` and use an empty result (AC-21).
- Pass `...(mem.entries.length > 0 ? { memory: mem.entries } : {})`.
- Set `memory_pulled: mem.pulled` in both trace objects.

- [ ] **Step 1: Write failing unit tests** `memory-retrieval.test.ts`:
  - `selectWithinBudget drops whole entries over budget`;
  - `caps at 20`;
  - `keeps rank order`;
  - `buildQueryText truncates diff to 4000`.
- [ ] **Step 2: Write failing integration tests** `memory-retrieval.it.test.ts`:
  - **Scope:** `global + same-repo injected, other-repo excluded`; `archived excluded`.
  - **Links:** `linked via attached skill injected`; `skips memories linked only to a disabled skill`.
  - **Globs:** `glob-scoped memory only when a changed file matches`.
  - **Ranking:** `falls back to fts when query embedding fails` (embedder rejects).
  - **Usage tracking:** `sets last_used_at`.
  - **Through a full run with mock LLM:** `review run passes memory to the prompt` (`run_traces.prompt_assembly.memory` contains `[learning]`); `trace memory_pulled lists injected ids`.
  - **Failure:** `review succeeds when retrieval throws` (repository method stubbed to throw).
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** both files, plus the existing `server/src/modules/reviews/project-context-injection.test.ts` → PASS.

AC-20: `modules/eval/service.ts` calls `reviewPullRequest` without `memory`; it must stay that way. Add to `memory-retrieval.it.test.ts`: `eval run assembly has no memory section` (`prompt_assembly.memory` null), so a future change can't silently add it.

---

### Task 8: CI export + runner

**Files:**
- Modify: `server/src/modules/ci/helpers.ts:140-143`, `server/src/modules/ci/service.ts:523`
- Modify: `agent-runner/src/memory.ts`, `agent-runner/src/run.ts:101,133`
- Rebuild: `agent-runner/bundle/runner.mjs`
- Test: `server/test/ci-helpers.test.ts` (extend), `agent-runner/test/memory.test.ts` (create, or extend if it exists)

**Interfaces — Produces:**
- `buildMemoryJsonl(items: { kind: MemoryKind; content: string; path_globs: string[] }[]): string`: one JSON object per line, `{"kind","content","path_globs"}`, with a trailing newline; `''` for an empty list.
- `MemoryRetriever.resolveForExport(workspaceId, repoId, agentId, skillIds): Promise<…>`: the same SQL filter as step 1 of Task 7, with no glob filter and no budget. Ordered by confidence desc, then `updated_at` desc, capped at `MEMORY_MAX_ENTRIES`.
- `loadMemory(devdigestDir, changedFiles: string[], readFile?)` → `MemoryEntry[]`:
  - Parses object lines and keeps those where `matchesAnyGlob(file, path_globs)` holds for any changed file.
  - A legacy plain-string line becomes `{ kind: 'fact', content }`.
- `run.ts` passes the PR's changed file paths, which it already has from the diff.

- [ ] **Step 1: Write failing tests:**
  - `buildMemoryJsonl emits one object per line`;
  - `empty list → ''`;
  - runner: `loadMemory drops lines whose globs match no changed file`, `legacy string line → fact entry`, `missing file → []`.
- [ ] **Step 2: Run** `cd server && pnpm exec vitest run test/ci-helpers.test.ts` and `cd agent-runner && pnpm test` → FAIL.
- [ ] **Step 3: Implement**, wiring `resolveForExport` into `ci/service.ts:523`.
- [ ] **Step 4: Verify** both suites → PASS. `cd agent-runner && pnpm typecheck && pnpm build` → `bundle/runner.mjs` is regenerated. `server` `ci.it.test.ts` → PASS.

---

### Task 9: Client hooks

Load the `tanstack-query` skill first.

**Files:**
- Create: `client/src/lib/hooks/memory.ts`
- Modify: `client/src/lib/hooks/reviews.ts:370-394` (drop the unused `memoryId?` from `useFindingAction`'s response type)
- Test: `client/src/lib/hooks/memory.test.tsx`

**Interfaces — Produces:**
- **Queries:**
  - `useMemories(query: MemoryListQuery)` → key `['memories', query]`;
  - `useMemory(id: string | null)` → key `['memory', id]`, `enabled: !!id`.
- **Learn draft:** `useLearnDraft()` → mutation `POST /findings/:id/learn/draft`. It is a mutation, not a query: it is user-triggered and never cached.
- **Duplicate check:** `useSimilarMemories(content: string, repoId: string | null)` → key `['memories-similar', repoId, debouncedContent]`. Debounced 400 ms, `enabled: content.trim().length >= 20`.
- **Mutations:**
  - `useCreateMemory()`, `useUpdateMemory()`, `useDeleteMemory()`, `useMergeMemory()`;
  - all invalidate `['memories']` and `['memory', id]`;
  - create and merge also invalidate `['reviews']` and `['multi-agent-run']`, because the finding gains `memory_id`.

- [ ] **Step 1: Write failing tests:**
  - `useMemories builds query string`;
  - `useCreateMemory invalidates memories and reviews`;
  - `useSimilarMemories disabled under 20 chars`.
- [ ] **Step 2: Run** `cd client && pnpm exec vitest run src/lib/hooks/memory.test.tsx` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.

---

### Task 10: Learn modal + FindingCard

**Files:**
- Create: `client/src/components/memory-form/{MemoryForm.tsx,index.ts,styles.ts,MemoryForm.test.tsx}`. It is shared by the Learn modal and the Memory page's Edit mode (Task 11), so it lives in `src/components/`.
- Create: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/LearnAction.tsx` + `LearnAction.test.tsx`
- Modify: `FindingCard.tsx:123-130` (replace the disabled button with `<LearnAction f={f} agentId={agentId} />`; add a "Learned" tag next to accepted/dismissed when `f.memory_id`, linking to `/memory?id=<memory_id>`)
- Modify: `client/messages/en/prReview.json` (`finding.learn`, `finding.learned`, remove `learnSoon` usage), `client/messages/en/memory.json` (form labels: links, all agents, path globs, similar, merge, fallback notice, unlinked)
- Test: `FindingCard.test.tsx` (update the "Learn disabled" assertion)

**Interfaces — Consumes:** Task 9 hooks; `useAgents()` and the existing skills list hook for the link pickers. **Produces:**
- **`MemoryForm` props:** `{ value: MemoryInput; onChange(v: MemoryInput): void; repoOptions: { id: string; name: string }[]; similar?: MemorySummary[]; onMerge?(id: string): void; readOnlySource?: MemorySource | null; disabledScope?: boolean }`. It is a controlled component with no fetching inside.
- **`LearnAction` flow:**
  1. Clicking it calls `useLearnDraft`.
  2. A `Modal` opens with `MemoryForm` pre-filled from `draft` and shows `similar`.
  3. **Save** calls `useCreateMemory({ ...value, finding_id })`; **Merge into this** calls `useMergeMemory(id, { content, confidence, finding_id })`.
  4. If `existing_memory_id` is set, the modal opens that memory and Save calls `useUpdateMemory` instead.
  5. A `draft.fallback` result shows the non-blocking notice.
  6. **Cancel** closes the modal with no request.

- [ ] **Step 1: Write failing tests:**
  - **MemoryForm:**
    - `hides team scope`;
    - `shows similar list with Merge buttons`;
    - `client-side blocks save over 600 chars`.
  - **LearnAction:**
    - `opens modal with drafted content`;
    - `Save posts finding_id`;
    - `Cancel sends nothing`;
    - `fallback notice shown`;
    - `learned finding opens edit of existing memory`.
  - **FindingCard:** `Learn enabled on undecided finding`; `shows Learned tag when memory_id set`.
- [ ] **Step 2: Run** `cd client && pnpm exec vitest run src/components/memory-form "src/app/repos/[repoId]/pulls/[number]/_components/FindingCard"` → FAIL.
- [ ] **Step 3: Implement.** Keep the multi-agent `TabsView.tsx` unchanged: it already renders `FindingCard` with `agentId`.
- [ ] **Step 4: Verify** the same command → PASS; `pnpm typecheck` → clean.

---

### Task 11: Memory page

**Files:**
- Modify: `client/src/app/memory/page.tsx` (thin page → `<MemoryView />`)
- Create: `client/src/app/memory/_components/MemoryView/` with `MemoryView.tsx`, `helpers.ts`, `constants.ts`, `styles.ts`, `index.ts`, `MemoryView.test.tsx`, `helpers.test.ts`
- Create: `client/src/app/memory/_components/MemoryView/_components/{filter-rail,memory-card,memory-detail}/` (each with an `index.ts` barrel, a PascalCase component, and a colocated test where it has logic)
- Modify: `client/messages/en/memory.json` (`count` → `"{count, plural, …} · {mode}"`, archived toggle, unlinked, search mode badge, delete confirm)

**Interfaces — Consumes:** Task 9 hooks, Task 10 `MemoryForm`; the selected repo from the existing app-shell repo context. **Produces:**
- `helpers.ts`:
  - `usedLabel(lastUsedAt: string|null, now: Date): { key: 'neverUsed'|'usedToday'|'usedDayAgo'|'usedDaysAgo'; days?: number }`;
  - `confidenceTone(c: number): 'high'|'mid'|'low'`, with thresholds ≥ 0.85 and ≥ 0.6, matching the design's green and amber dots.
- Layout per spec "Design reference":
  - **Filter rail:** Scope `repo`/`global` with counts, Kind ×5 with counts, Freshness "Show stale (>60d)", "Archived".
  - **Center:** heading + count + mode badge, search input (debounced 300 ms into `q`), card list.
  - **Detail panel:** kind badge; Edit, which toggles `MemoryForm`; Delete with confirm; Archive/Unarchive; stats; linked agents/skills; globs; source contexts with PR links.
- The repo filter defaults to the shell's selected repo, and global entries are always included (AC-28). A `?id=` search param preselects that memory in the detail panel (AC-7 deep link).

- [ ] **Step 1: Write failing tests:**
  - **Helpers:** `usedLabel never/today/1d/Nd`; `confidenceTone thresholds`.
  - **Filters and search:**
    - `stale hidden by default, shown with toggle` (the request carries `stale=true`);
    - `search shows semantic badge from response`.
  - **Detail panel:**
    - `selecting a card opens detail with source PR chips`;
    - `Delete asks confirmation then calls DELETE`;
    - `Unlinked memory shows Unlinked badge`.
  - **Empty state:** `empty state text from memory.json`.
- [ ] **Step 2: Run** `cd client && pnpm exec vitest run src/app/memory` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `pnpm typecheck` → clean.

---

### Task 12: e2e happy path + docs touch-ups

**Files:**
- Create: `e2e/specs/10-memory.flow.json` (format per `e2e/specs/README.md`); update `e2e/specs/coverage.md`
- Modify: `docs/agent-prompts/README.md:51` (`## Relevant memory` is now a `<team-memory>` block with a preamble)
- Modify: `server/specs/eval.md:39` and `client/specs/agent-evals.md:35` (point to `SPEC-2026-10-12-memory` as the superseding decision; keep "never in evals")
- Modify: `specs/2026-10-12-memory.md` header `Status: approved` → `implemented` only after Task 12 passes

The flow:
1. Open the seeded PR, expand a finding, and Dismiss it.
2. Click Learn; the modal is visible with non-empty content. Click Save.
3. Go to `/memory`; one card is visible with that content.
4. Rerun the review and open the trace drawer; the memory section contains the content.

- [ ] **Step 1: Write the flow file.** **Step 2: Run** the e2e suite per `e2e/README.md` with the dev stack up (`./scripts/dev.sh`) → it fails before Tasks 4–11 and passes after.
- [ ] **Step 3: Final verification**, every command with zero failures:
  - in `server/`: `pnpm test` and `pnpm typecheck`;
  - in `reviewer-core/`: `pnpm test` and `pnpm typecheck`;
  - in `client/`: `pnpm test` and `pnpm typecheck`;
  - in `agent-runner/`: `pnpm test` and `pnpm typecheck`.

---

## Task order / parallelism

`1 → 2 → 3` (3 only needs 1), then `4 → 5 → 6 → 7` (server, sequential: same module), `8` after 7, `9` after 1, `10` after 9 + 6, `11` after 10, `12` last. Server (4–8) and client (9–11) can run in parallel once Task 1 is done, as long as the client mocks `fetch`.

## AC → task traceability

| AC | Task | AC | Task |
|---|---|---|---|
| 1, 7, 8 | 6, 10 | 17, 17a | 3 |
| 2–6 | 6, 10 | 18 | 1, 7 |
| 9, 10 | 4, 5, 10 | 19, 21 | 7 |
| 11, 12 | 1, 4 | 20 | 7 |
| 13 | 2, 4 | 22, 23 | 2, 5 |
| 14, 15, 16 | 7 | 24–29 | 11 |
| 30, 30a | 8 | e2e | 12 |
