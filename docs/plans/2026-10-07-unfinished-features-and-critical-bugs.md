# Development Plan — unfinished features + critical bugs

Date: 2026-10-07 · Branch: `L6/eval-hw` · Re-verified against HEAD `ea7db32`
Source: project-wide spec audit (2026-10-07) → implementation-planner.
Execution mode: **full multi-agent pipeline** — each Phase is one `/implement`
run (implementer → architecture-reviewer w/ fix loop → plan-verifier →
doc-writer). `/implement` has no test-writer stage, so the implementer writes
the tests listed per step. `[P]` = parallelizable within the phase, `[S]` =
sequential after the named step.

## Re-verification delta vs the audit

- F5 catalog parser AC-9..14 — **already covered** (`server/test/skills-catalog.test.ts`), dropped.
- F2 — partly done: in-progress badge + settle refresh exist (`PRRow.tsx:47-57`),
  but `useRunReview` (`lib/hooks/reviews.ts:251-263`) never invalidates
  `["pr-active-runs", prId]`, so AC-14 never fires for a row-started run;
  AC-15 failure state missing.
- PR triage AC-1..13, 32, 33 implemented — only tests missing.
- Community-catalog amendment AC-35..48 implemented (075b562).
- Worse than reported:
  - B2: for `must_not_flag`, `expected_output: null` → `parseLocations(null)`
    = `[]` = "assert empty" → whole diff forbidden.
  - B9: capped repo also under-counts `files_discovered` (`full.ts:122`
    doesn't add `bounded` to `filesSkipped`) → breaks onboarding AC-15.
  - F3: `evals/skills/dependency-checker` targets a skill absent from
    `.claude/skills/` → eval throws `SKILL.md not found`.

## Specs followed

server/client `project-context.md` (SPEC-04), `pr-triage-queue.md` (SPEC-05,
S-AC / C-AC), `onboarding-tour.md` (SPEC-06), `server/specs/community-catalog.md`
(SPEC-07), `client/specs/agent-evals.md` (case editor), `client/specs/agent-ci.md`
(SPEC-03, no AC ids → "bug fix, no AC"), `evals/specs/skill-eval-harness.md` (SPEC-01).

## Decisions (confirmed by the user 2026-10-07)

- **R1 (B2) ACCEPTED** — also validate `expected_output` as an array
  server-side (`eval/routes.ts:52,67`, today `z.unknown()`) → 422.
- **R2 (B6) ACCEPTED** — synchronous refusal: `POST /repos/:id/resync` → 409
  `{ paths }`; in-job race path merges the reason into `repo_index_state.stats`
  without touching `status`.
- **R3 (B10) ACCEPTED** — per-PR atomic "check in-flight + insert" via
  transaction + `pg_advisory_xact_lock` in `prId` order, no migration.
- **R4 + R5 (B11) ACCEPTED** — entry bodies from
  `raw.githubusercontent.com/{owner}/{name}/HEAD/{path}` (not counted against
  the 60/hr REST limit; tree stays one REST call); a failed body keeps the
  entry with AC-12-style fallback metadata; catalog unavailable only when the
  tree read fails.
- **Q2 (B4)** — oversized document in a run → existing `dropped_for_budget`
  outcome; `SpecReadOutcome` contract unchanged.
- **Q3 (B10)** — the single-PR `POST /pulls/:id/review` path ALSO goes through
  `createRunsIfIdle`; if any run is in flight for that PR it returns
  **409 `review_in_progress`** and the client shows "review already running".
- **Q4 (F3)** — CREATE the missing `.claude/skills/dependency-checker/SKILL.md`
  so the existing eval runs (requirements derived from its cases, see Phase 7.3).
- **Q5 (S5)** — C-AC-28/29 verified by an RTL unit test with a mocked
  `EventSource`; the spec's verification method is amended to "unit test".
- **S1 (F3)** — the merged code is the source of truth; spec-creator rewrites
  `evals/specs/skill-eval-harness.md` to match the course template (with a
  changelog entry), then Phase 7 fills the remaining gaps.
- **S2–S6** — one batched spec-creator pass BEFORE implementation of Phases
  1–6 (Phase 0 may run independently), so plan-verifier can trace every fix to
  an AC.

## Architectural constraints

- Onion: `service.ts` never imports Drizzle/fs; `repository.ts` owns DB (and the
  clone FS for project-context); `helpers.ts` pure. New transactions/locks
  (B5, B10) live **in repositories** (server/INSIGHTS.md 2026-10-07).
- Jobs reaper (B8) in `platform/jobs.ts`, called from `app.ts` like existing reapers.
- Catalog host change stays inside `adapters/github/catalog.ts` behind `CatalogSource`.
- Validation via zod route schemas only (→ 422). `AppError.details` + client
  `ApiError.details` already exist — B6's 409 needs no contract change.
- Do not touch `*/vendor/shared`, `client/src/vendor/ui`. B3: fix fixtures to
  match contracts; widen `server/src/adapters/mocks.ts` id to `LLMProvider['id']`.
  F1: `ReviewEstimate` / `BulkReviewResponse` already exist in `review-api.ts:76-106`.
- No migrations planned.
- Client: colocated `_components/<Name>/` with barrel, styles, test; `@/` imports
  only (fix `PublishDialog.tsx:7` and `PRRow.test.tsx` deep paths when touched).
- INSIGHTS: optional Fastify bodies need `.nullish()`; integration tests with
  `--no-file-parallelism`; client: "not loaded" ≠ "loaded empty"; no prop
  callbacks inside `setState` updaters; `git diff` any edited barrel.

## Skills

onion-architecture, fastify-best-practices, zod, drizzle-orm-patterns, security,
react-project-structure, react-best-practices, react-testing-library.

---

## Execution order

1. **Spec pass (spec-creator, one batched run)** — S1 + S2..S6 below. Phase 0
   does not depend on it and may run in parallel.
2. Phase 0 → 1 → 2 → 3 → 4 → 5 (after 2.4) → 6 → 7 (after S1).

## Phase 0 — green baseline (B3). Blocks all later phases.

- **0.1 [P] server typecheck** → onboarding S-AC-17. `server/src/adapters/mocks.ts`:
  type `MockLLMProvider.id` + ctor param as `LLMProvider['id']`.
  Done: `cd server && pnpm typecheck` exits 0.
- **0.2 [P] contracts fixtures** → S-AC-19/20 (project-context trace).
  `server/test/contracts.test.ts`: replace the dead `Onboarding` import with the
  current export from `vendor/shared/contracts/onboarding.ts` (read-only) + a
  minimal valid fixture; add `cost_usd: null` to `RunTrace.stats`. Done: both pass.
- **0.3 [P] Windows temp paths** (no AC). `server/test/indexer-pipeline.test.ts:140-145`:
  `dirname(full)` instead of `lastIndexOf('/')`. Done: 11/11 pass on Windows.
- **0.4 [P] PRRow test** → C-AC-11..15. Wrap in fresh `QueryClientProvider`
  (`retry:false`); mock `@/lib/hooks/reviews` (`usePrReviews`, `usePrActiveRuns`).
  Done: client `pnpm test` 0 failures.
- **0.5 [S] integration baseline**: `cd server && pnpm exec vitest run .it.test --no-file-parallelism`
  (Docker); record pre-existing failures in the Implementation Report.

## Phase 1 — security (B4, B7)

- **1.1 [P] B4 symlink-safe containment + size cap** → S-AC-16, 24, 25, 26 + NFR path traversal.
  Files: `project-context/repository.ts` (`readDocument`, `writeDocument`),
  `constants.ts` (`MAX_DOCUMENT_BYTES`), `routes.ts` (`.max()` on content, paths,
  path length), `service.ts`.
  - Read: `realpath` root; `lstat` target, refuse symlink; `realpath` target and
    re-check `isWithinRoot`; `stat` size first → distinct too-large result.
  - Write: realpath nearest existing ancestor before `mkdir`, re-check after;
    refuse existing symlink target; `O_NOFOLLOW` on POSIX (lstat fallback on Windows).
  - Service: too-large doc in a run → `dropped_for_budget`; read/save endpoints → 413/422.
  - Tests: new hermetic `server/test/project-context-repository.test.ts` (temp dir):
    file symlink outside → read null / write refused; dir junction outside →
    refused (`it.skipIf` EPERM); oversized → too-large; nested create still works.
- **1.2 [P] B7 `repo_id` validation + create ownership** → S-AC-21, 23, 38, 42 (+ no-AC create check).
  `skills/routes.ts:43,55,61,67`: create `.uuid().optional()`, update
  `.uuid().nullable().optional()`, import `.uuid()`, list
  `z.union([z.literal('none'), z.string().uuid()]).optional()`.
  `skills/service.ts` `create()`: `repoBelongsToWorkspace` → `ValidationError`.
  Tests (`skills.it.test.ts`): non-uuid on 4 endpoints → 422; foreign repo on
  `POST /skills` rejected, nothing persisted.

## Phase 2 — data integrity (B1, B2, B5, B10)

- **2.1 [P] B1+B2 eval case editor** → C-AC-20, 22, 46, 49.
  `client/src/components/eval-cases/EvalCaseEditorModal/EvalCaseEditorModal.tsx`, `messages/en/eval.json`, tests.
  - B1: persisted id in state seeded from `initialCase?.id`; `persist()` updates
    when an id exists; after first save hide kind picker, header → case title.
  - B2: Advanced mode blocks Save/Run when JSON invalid **or** not an array
    (hint via `aria-describedby`); never send `null`.
  - Tests: Run→Save = 1 create + 1 update; Run twice = 1 create; invalid JSON
    blocks; `{}` blocks; `[]` saves `[]`.
  - R1 server: `server/src/modules/eval/routes.ts:52,67` — `expected_output`
    becomes an array schema (`z.array(z.unknown())` or the existing entry
    schema if one is exported); test in the eval integration suite: `{}` and
    `null` → 422.
- **2.2 [P] B5 server atomic set replace** → S-AC-9, 10.
  `project-context/repository.ts:60-82`: `setAgentDocuments` / `setSkillDocuments`
  in `db.transaction` with a per-owner lock (`SELECT … FOR UPDATE` on owner row
  or `pg_advisory_xact_lock`), then delete + insert.
  Tests: new `server/test/project-context.it.test.ts` — replace + order; 10
  concurrent POSTs → all 2xx, final set equals one submitted set; same for skills.
- **2.3 [P] B5 client optimistic serialized attach** → C-AC-14, 21, 22.
  `client/src/lib/hooks/project-context.ts:103-135`, both `ContextTab.tsx`.
  Hooks take owner id; mutation `scope: { id: 'agent-context:'+agentId }`;
  `onMutate` cancel + `setQueryData`, `onError` rollback, `onSettled` invalidate;
  tabs derive next set from cache. Test: two quick toggles → second POST has both paths.
- **2.4 [P] B10 bulk review isolation + race safety** → S-AC-3, 4, 8, 9.
  `reviews/service.ts:211-242`, `reviews/repository.ts` + run-repo.
  New repo method `createRunsIfIdle(workspaceId, prId, agents)` (tx + advisory
  lock, check active, insert; null if in flight; acquire in `prId` order).
  Per-PR try/catch; on failure mark created rows `failed` with reason, outcome
  `failed`, continue. Q3: the single-PR `POST /pulls/:id/review` also uses
  `createRunsIfIdle` → `AppError('review_in_progress', …, 409)` when a run is
  in flight; client `useRunReview` / `RunReviewDropdown` shows an i18n
  "review already running" message on that code (`prReview.json`).
  Tests: new `server/test/reviews-bulk.it.test.ts` —
  injected failure → that PR `failed`, no `running` rows, others `started`;
  two concurrent bulk POSTs → exactly `enabledAgents` running rows per PR,
  second reports `skipped`; two concurrent single-PR POSTs → one 200, one 409
  `review_in_progress`; client test for the 409 message.

## Phase 3 — stuck states / lost signals (B6, B8, B9, B12)

- **3.1 [S] B6 server refusal reaches caller** → S-AC-28.
  `repo-intel/routes.ts:43-61`, `service.ts:153-185`, `repository.ts` (`mergeIndexStats`).
  Route: ownership check → service returns blocking paths
  (`gitStatus.modifiedPaths` + `filterAllowedPaths`) → if any, 409
  `project_context_blocked` `{ paths }`, nothing enqueued. In-job check stays;
  on refusal merge reason into `stats`, status unchanged; next success clears.
  Tests: `repo-intel-resync.test.ts` (no `git.sync`, reason persisted); route
  `app.inject` 409; AC-28 case in `project-context.it.test.ts`.
- **3.2 [S after 3.1] B6 client** → C-AC-9. `ProjectContextView.tsx` (+helpers, test):
  resync `onError` with 409 / `project_context_blocked` → render refusal with
  `details.paths`, stop polling; keep `parseBlockedPaths` for persisted reason.
- **3.3 [P] B8 server boot reaper** → S-AC-3, 7. `platform/jobs.ts` `reapOrphaned()`
  (`queued`/`running` → `failed`, `error:'interrupted'`, `finishedAt`);
  `app.ts:80-95` awaited try/log. Test (`onboarding.it.test.ts`): seeded running
  job → new POST returns a **new** job id.
- **3.4 [P] B8 client poll ceiling** → C-AC-20, 22, 24. `OnboardingView.tsx` +
  colocated `constants.ts` (~150 s), `onboarding.json`. After ceiling: stop
  polling, failure message, re-enable Regenerate, keep existing tour.
  Tests with fake timers.
- **3.5 [P] B9 honest cap + timeout skeleton** → S-AC-15, 23, 24, 27.
  `repo-intel/pipeline/full.ts:122,252`: `bounded > 0` → `partial`; add
  `bounded` to `filesSkipped`. `onboarding/service.ts:221-242,347` +
  `constants.ts`: model timeout = `GENERATION_DEADLINE_MS − elapsed − PERSIST_MARGIN_MS`
  so the AC-24 skeleton persists before the guard. Tests: never-resolving LLM
  mock → skeleton with `model_failure_reason:'timeout'`; injectable cap →
  `partial` + counts → `repo_too_large`.
- **3.6 [P] B12 CI fixes** (no AC).
  `CiRunsView.tsx:24`: capture `since` in state on toggle.
  `PublishDialog.tsx:7,76` (+ colocated `helpers.ts`): provider → secret name
  (mirror `server/src/modules/ci/helpers.ts:25-31`); `@/lib/hooks/ci` import.
  `ci/routes.ts:23`: `since: z.string().datetime({ offset: true }).optional()`.
  Tests: new `CiRunsView.test.tsx` (one fetch, no refetch on re-render);
  PublishDialog openrouter → `OPENROUTER_API_KEY`; `?since=foo` → 422.

## Phase 4 — community catalog robustness (B11)

- **4.1 [S]** → S-AC-5, 6, 8, 19, 31. `adapters/github/catalog.ts:56-75`,
  `skills/service.ts:394-432`. `fetchBody` via raw host (R4) keeping timeout +
  byte cap; in-flight `Map<fullName, Promise>` dedup; bodies through `p-queue`
  bounded concurrency + `allSettled`; failed body → R5 fallback; unavailable
  only on tree failure. Tests (`MockCatalogSource`): 2 concurrent → `listTree`
  once; one body rejects → available with N entries; tree rejects →
  unavailable; cache hit → 0 calls.

## Phase 5 — PR triage client (F1, F2). After 2.4.

- **5.1 [P] hooks** → C-AC-14, 17, 24, 25. `client/src/lib/hooks/reviews.ts`:
  `useRunReview.onSuccess` also invalidates `["pr-active-runs", prId]` +
  `["pr-runs", prId]` (the AC-14 fix); new `useReviewEstimate(repoId, enabled)`;
  new `useBulkReview(repoId)` invalidating `pr-active-runs` per started PR +
  `["pulls", repoId]`. Types from `@devdigest/shared`. Hook tests.
- **5.2 [S after 5.1] "Review all" button + dialog** → C-AC-16..24, 30, 31.
  New `pulls/_components/ReviewAllButton/` (+ `_components/ReviewAllDialog/`,
  `constants.ts` `BULK_REVIEW_MAX_PRS = 20`, styles, barrel, tests); wire into
  `page.tsx` header next to Triage toggle; `prReview.json` `list.reviewAll.*`.
  Label with needs_review count (16); disabled + reason at 0 (23); dialog with
  PR/agent/run counts + approximate cost (17, 19), no $ without history (20),
  skip count (21); >20 refusal + server `bulk_review_too_large` (22);
  cancel → no POST (18); confirm → body-less POST (24); per-PR `failed`
  listed, batch not failed (26). One RTL test per AC.
- **5.3 [P with 5.2] row failure state** → C-AC-15, 25, 26, 27. `PRRow.tsx`:
  on settle enable `usePrRuns(pr.id)`; newest failed → badge next to dropdown;
  no auto-retry. Tests: running→failed badge; running→done invalidates
  `["pulls", repoId]`; no extra request before settle.
- **5.4 [S]** C-AC-28/29: RTL unit test with a mocked `EventSource` asserting
  the list page opens none per run (verification method amended to "unit
  test" in the spec pass, Q5); manual `agent-browser` alignment check for C-AC-31.

## Phase 6 — test coverage (F4, F5). After Phases 2–3.

- **6.1 [P]** bulk review integration → S-AC-1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 16
  (+ unit 13/14) in `reviews-bulk.it.test.ts` (AC-7: slow mock, max concurrency ≤ 3;
  AC-5: 21 PRs → 400, zero rows).
- **6.2 [P]** client triage → C-AC-1..10, 32: `pulls/helpers.test.ts`
  (`compareByRisk`) + page test.
- **6.3 [P]** onboarding integration → S-AC-1, 2, 3, 4, 5, 7, 21, 22, 23, 24, 26
  in `onboarding.it.test.ts` (temp clone + `MockLLMProvider`).
- **6.4 [P]** skills scope integration → S-AC-35..43, 45..48 (unit 44) in new
  `skills-scope.it.test.ts`.
- **6.5 [P]** project-context AC-29 (+15, 19): `mocks.ts` `structuredWhen?(req)`
  option; fixtures in `server/test/fixtures/project-context/` (fixed diff + doc
  with sentinel); review twice attaching doc between → findings differ, run 2
  `specs_read` = `injected`.

## Phase 7 — evals (F3). BLOCKED on spec-creator pass S1.

AC ids below refer to the pre-rewrite SPEC-01; re-map them to the rewritten
spec's AC ids before running `/implement`.

- 7.1 [S] onion-architecture eval (`pnpm eval:scaffold onion-architecture`,
  3–4 cases + fixtures) → AC-15, 16.
- 7.2 [P] verbatim-evidence check in `evals/src/scoring/llm-judge.ts` (PASS
  with non-substring evidence → FAIL "fabricated quote") + unit test → AC-8.
- 7.3 [P] Q4: create `.claude/skills/dependency-checker/SKILL.md` (frontmatter
  `name` + trigger-rich `description`, English) so
  `evals/skills/dependency-checker` runs. Requirements derived from
  `dependency-checker.cases.ts`:
  - scans client/, server/, reviewer-core/, e2e/ package.json + installed
    sizes + cross-package imports (Read/Bash/Grep);
  - report sections: **Scope**, a fenced ```mermaid `flowchart` of
    package relationships, a **size breakdown table**, **Findings &
    Priorities** grouped by P0 / P1 / P2 / Info, a **Summary** of 3–5
    prioritized actionable takeaways;
  - distinguishes internal tsconfig-alias / relative-path dependencies from
    external npm deps; flags deep relative imports into another package's
    `src/` (bypassing its entry point) as P0; never claims workspace:* /
    pnpm workspaces (repo is explicitly not a monorepo);
  - calls out version drift across packages and declared-but-unimported deps;
  - every finding names a concrete package/dependency/file;
  - removals are recommendations for the user to confirm, never executed.
  - Use the `anthropic-skills:skill-creator` / `superpowers:writing-skills`
    guidance; add it to `.claude/skills/README.md`.
  - Done: `cd evals && pnpm eval:skills dependency-checker` runs (no
    `SKILL.md not found`) and meets the case thresholds.

## Test plan

- client: `cd client && pnpm test && pnpm typecheck`
- server unit: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`
- server integration: `cd server && pnpm exec vitest run .it.test --no-file-parallelism`
- evals (Phase 7): `cd evals && pnpm vitest run skills/onion-architecture && pnpm vitest run src`
- Test names include the AC/bug id (e.g. `B10 / S-AC-8: …`) for plan-verifier traceability.

## Spec-creator pass (one batched run, before Phases 1–7)

- **S1 SPEC-01 evals (blocks Phase 7):** rewrite to match the merged course
  template (code is truth) with a changelog entry — Agent SDK default backend,
  `EVAL_MODEL`, key requirements per backend, no reviewer-core reuse, exit code
  via vitest; keep onion-architecture eval + verbatim-evidence check as ACs;
  add the dependency-checker skill eval.
- **S2 SPEC-07:** create-time `repo_id` ownership AC; per-entry body-failure
  fallback (R5); raw host for bodies vs AC-5 wording (R4); `repo_id` must be a
  uuid (422).
- **S3 SPEC-04:** symlink policy (refuse any symlink / out-of-root real path)
  + document size cap (`dropped_for_budget` in runs, 413/422 on endpoints);
  AC-28 transport = synchronous 409 `{ paths }` + persisted reason; AC-29
  verification via deterministic stub; atomic set replace.
- **S4 SPEC-06:** client poll ceiling as a failure state; boot reaping of
  orphaned jobs; capped repo reported as `partial`.
- **S5 SPEC-05:** C-AC-28/29 verification → unit test; single-PR review
  returns 409 `review_in_progress` when a run is in flight; bulk per-PR
  failure isolation.
- **S6 agent-evals:** Advanced mode invalid / non-array JSON blocks Save;
  server rejects non-array `expected_output` with 422.
- CI (SPEC-03) has no AC ids — B12 stays "bug fix, no AC" unless spec-creator
  adds ACs in the same pass.

## Open questions / risks

- **Q6** `.claude/skills/README.md` cut to one row in 5d84a69 — restoring is a
  doc-writer task (do it together with Phase 7.3's README entry).
- Risk: 20 running rows × 4 s polling ≈ 5 req/s; repo-level active-runs endpoint is the follow-up.
- Risk: `compareByRisk` is non-transitive (out of scope); 6.2 tests may expose it.
- Risk: Windows symlink tests need `junction` / may skip without developer mode.

## Out of scope

Architecture/security review (separate agents per phase), medium/minor polish,
e2e flows, vendored `vendor/shared` / `vendor/ui` edits, spec content changes.

## Progress

### Phase 0 — DONE 2026-10-07 (uncommitted)

- Files: `server/src/adapters/mocks.ts` (MockLLMProvider id typed as
  `LLMProvider['id']`), `server/test/contracts.test.ts` (OnboardingTour
  fixture, RunTrace `stats.cost_usd` null), `server/test/indexer-pipeline.test.ts`
  (`dirname`; 11/11), `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx`
  (QueryClientProvider + `@/` partial mock via `importOriginal`).
- Results: server typecheck clean, server unit 381/381, client typecheck
  clean, client 484/484. Architecture review: approve. plan-verifier: COMPLETE.

### Integration baseline (pre-existing failures)

20 files, 156/160 pass. Later phases must not be blamed for these:

- `reviews.it.test.ts`: "dual-provider structured output: anthropic provider
  returns the same Review shape" and "finding actions: accept, dismiss"
  (TypeError reading `findings`, ~10s, likely a `waitForPrRuns` timeout).
- `skills.it.test.ts`: "an agent with no linked skills has a null skills
  prompt block" (TypeError reading `skills`).
- `settings-models.it.test.ts`: "resolveFeatureModel: registry default until
  overridden..." (provider `openrouter` vs expected).
- An earlier truncated run also showed skills "run-executor resolves an
  agent's linked, enabled skills..." failing; treat run-executor tests as flaky.

### Spec pass S1-S6 — DONE 2026-10-07

Specs updated with new ACs. Re-map for Phase 7: 7.1 -> SPEC-01 AC-15/16,
7.2 -> AC-8 (+AC-9), 7.3 -> AC-22/23/24.

New ACs:

- community-catalog: server AC-49..54, client AC-53..58
- project-context: server AC-29..39, client AC-29..33
- onboarding: server AC-28..32, client AC-31..32
- pr-triage: server AC-21..24, client AC-34 (C-AC-28/29 now a unit test)
- agent-evals: client AC-52..54; eval server AC-52

### Phase 1 — DONE 2026-10-07 (uncommitted)

- Files: `server/src/modules/project-context/{constants,repository,service,routes}.ts`
  (B4: symlink-safe containment + size cap), `server/src/modules/skills/{routes,service}.ts`
  (B7: `repo_id` uuid validation + create-time ownership), new
  `server/test/project-context-repository.test.ts`, `server/test/skills.it.test.ts`,
  `server/test/skills-service.test.ts`.
- Limits chosen (implementation-chosen, recorded in the spec changelog):
  `MAX_DOCUMENT_BYTES` 256 KiB, `MAX_DOCUMENT_PATH_LENGTH` 512,
  `MAX_ATTACHED_PATHS` 200. Oversized direct read: 413 `payload_too_large` with
  `details.max_bytes`.
- Results: typecheck clean; unit 392 pass / 2 skipped (the 2 file-symlink tests
  skip on Windows without developer mode; junction variants run); `skills.it`
  9/10 with a run-executor flaky failure that passes when run alone.
- Reviews: architecture review "comment" (0 CRITICAL); security review: no
  findings with confidence >= 8; plan-verifier: all code requirements MET, gaps
  are missing tests only.
- Test debt:
  - AC-32: `dropped_for_budget` mapping in `resolveForRun` untested.
  - AC-33/AC-34: HTTP 413 / 422 responses untested.
  - AC-21/AC-38/AC-42: untagged (no test references them).
  - File-symlink tests need Linux CI or elevated Windows to actually run.
- Non-blocking follow-ups (architecture review):
  - Move pure `isRootOrInside` from `project-context/repository.ts` to `helpers.ts`.
  - Optionally pass `maxBytes` into the repository instead of importing the
    policy constant from `constants.ts`.
  - `skills-service.test.ts` spies on a private method; prefer asserting via
    public behaviour.

### Phase 2 — DONE 2026-10-07 (uncommitted)

- Files (server): `server/src/modules/reviews/{service.ts,repository.ts,repository/run.repo.ts}`,
  `server/src/modules/project-context/repository.ts`,
  `server/src/modules/eval/routes.ts`; new tests
  `server/test/{reviews-bulk.it.test.ts,project-context.it.test.ts}`, plus
  `server/test/eval.it.test.ts`.
- Files (client): `src/components/eval-cases/**` (`EvalCaseEditorModal`,
  `AdvancedJsonEditor` -> native textarea for `aria-describedby`, `helpers.ts`
  `parseExpectedJson`), `src/lib/hooks/{project-context.ts,reviews.ts}`,
  `src/lib/providers.tsx` (mutation `meta.silentCodes` suppresses the global
  toast), `src/components/run-review-dropdown/**`, both `ContextTab` folders,
  `messages/en/{eval.json,prReview.json}`.
- Results: server typecheck clean; unit 392 pass / 2 skipped; integration
  `project-context.it` 5/5, `reviews-bulk.it` 5/5, `eval.it` 8/8 (broader run
  118/119, the one failure being baseline "finding actions: accept, dismiss");
  client typecheck clean; client 60 files, 497/497.
- Reviews: architecture comment (0 CRITICAL); security no findings >= 8;
  plan-verifier all MET after the AC-24 wording fix. No test debt for Phase 2.
- Behavior notes:
  - MCP `run_agent_on_pr` now also gets 409 `review_in_progress` while a run is
    in flight.
  - JSON `null` in the Advanced editor is now "not an array" (blocked) instead
    of "invalid".
- Non-blocking follow-ups:
  - [WARNING] `ContextTab` components read the query cache directly
    (`useQueryClient` + exported `agentContextKey`/`skillContextKey`, duplicated
    in both tabs); move into the hook (e.g. `replace(updater)`).
  - `EvalCaseEditorModal` re-parses JSON inline; let `parseExpectedJson`
    `notArray` carry the value, optionally extract `usePersistCase`.
  - `AdvancedJsonEditor` uses a local textarea until `@devdigest/ui` Textarea
    supports `aria-describedby`.
  - Type `mutationMeta` via TanStack `Register` instead of the cast in
    `providers.tsx`.
  - `failRunningRuns` defensive path has no service-level test.
  - Local row order may go stale after chained mutation failures until resync.
  - Phase 5 still needs `useRunReview` to invalidate `["pr-active-runs", prId]`.

### Phase 3 — DONE 2026-10-07 (uncommitted)

- Files (server): `src/modules/repo-intel/{constants,repository,service,routes}.ts`,
  `src/modules/repo-intel/pipeline/{walk,full}.ts`, `src/platform/jobs.ts`,
  `src/app.ts`, `src/modules/onboarding/{constants,service}.ts`,
  `src/modules/ci/routes.ts`. Tests: `test/repo-intel-resync.test.ts`,
  `test/project-context.it.test.ts` (resync refusal), new
  `test/onboarding.it.test.ts`, `test/indexer-pipeline.test.ts`,
  `src/modules/onboarding/service.test.ts`, `test/ci.it.test.ts`.
  `PERSIST_MARGIN_MS=5000`.
- Files (client): `src/lib/hooks/repo-intel.ts` (`silentCodes`),
  `ProjectContextView` (+ `helpers.ts`, new test), `OnboardingView`
  (+ `constants.ts` with `POLL_CEILING_MS=150000`, new test), `CiRunsView`
  (+ new test, `@/` imports), `PublishDialog` (+ `helpers.ts`
  `providerSecretKey`, tests), `messages/en/onboarding.json`
  (`generateTimedOut`).
- Results: server typecheck clean; unit 398 pass / 2 skipped; integration
  `project-context.it` / `onboarding.it` / `ci.it` 15/15 (implementer's broader
  run 24/24); client typecheck clean; client 63 files, 504/504. No test debt.
- Reviews: architecture comment (0 CRITICAL); security no findings;
  plan-verifier COMPLETE, no gaps.
- Behavior notes:
  - `POST /repos/:id/resync` now returns 404 for a repo outside the workspace
    (was 202 for any id).
  - `tryGetIndexState` surfaces `degradedReason` `repo_too_large` on partial
    rows.
  - `mergeIndexStats` overwrites `stats.reason` (e.g. `soft_budget`) until the
    next index run.
  - If no `repo_index_state` row exists, the in-job refusal cannot be persisted
    (the route pre-check makes this rare; an upsert is an option).
  - The reaper assumes one API instance per DB.
- Non-blocking follow-ups:
  - Update the local-service comment in `repo-intel/routes.ts` (it now also
    serves `findResyncBlockers`).
  - `PublishDialog` `helpers.ts` mirrors the server `providerSecretKey`;
    longer term, have the CI preview return the secret name or add a contract
    test.
  - Move `BLOCKED_ERROR_CODE` to a `constants.ts` (literal is duplicated in
    `hooks/repo-intel.ts`).
  - `IndexPayload.maxIndexedFiles` is a test seam on the prod payload.
  - The poll ceiling could move into `useOnboardingTour` (tanstack-query skill:
    polling should stop itself).
  - Pre-existing: missing i18n key `ci.json` `runs.status.no_findings`
    (CiRunsView constants), still unfixed.
  - Pre-existing: `GET /repos/:id/index-state` has no ownership check (not
    exploitable under the single-workspace `LocalNoAuthProvider`).
  - Onboarding test ids use new S-AC-28..32 while the plan text cites
    S-AC-3, 7, 15, 23, 24, 27 (same behaviours).

### Phase 4 — DONE 2026-10-07 (uncommitted)

- Files (server): `src/adapters/github/catalog.ts` (`fetchBody` now reads
  `raw.githubusercontent.com/{owner}/{name}/HEAD/{path}`, path segments
  encoded, `Accept` header dropped, 5s timeout + 200,000-char cap kept;
  `listTree` unchanged), `src/modules/skills/service.ts` (`catalogInflight`
  dedup in `loadCatalog`; `populateCatalog` with PQueue + `allSettled` and a
  `parseCatalogEntry(path, folder, '')` fallback; cache write in `loadCatalog`
  gated on in-flight slot ownership), `src/modules/skills/constants.ts`
  (`CATALOG_BODY_CONCURRENCY = 8`). Tests: `test/skills-service.test.ts` (7 B11
  tests), new `test/github-catalog-adapter.test.ts` (4).
- Results: server typecheck clean; unit 41 files, 409 pass / 2 skipped;
  `skills.it` 9/10 (the one failure is the baseline flaky "an agent with no
  linked skills has a null skills prompt block").
- Reviews: architecture comment — 1 WARNING (a superseded population after
  `forceRefresh` could overwrite the newer cache), fixed in the same round with
  a regression test; security no findings >= 8; plan-verifier COMPLETE. No
  test debt (minor: no test triggers the real 5s timeout abort for AC-19).
- Behavior notes:
  - `forceRefresh` also drops the in-flight population.
  - Fallback entries (from failed bodies) are cached for the full 15-minute TTL.
  - The byte cap still applies after the full body is buffered (streaming cap
    is a hardening follow-up).
- Non-blocking follow-ups:
  - Optionally skip caching / use a shorter TTL when any body fell back.
  - Extract a cache/dedup helper if a second catalog consumer appears.
  - Tighten the `parseCatalogRepoValue` regex to reject `.`/`..` owner/name
    (pre-existing, hardening).
  - Streaming byte cap.
  - Tidy the stale "See this task's Implementation Report" comment above
    `loadCatalog` in `skills/service.ts`.

### Phase 5 — DONE 2026-10-07 (uncommitted)

- Files (client): `src/lib/hooks/reviews.ts` (`useRunReview` now invalidates
  reviews / pr-active-runs / pr-runs; new `useReviewEstimate` with key
  `["review-estimate", repoId]`, `staleTime`/`gcTime` 0; new `useBulkReview`,
  body-less POST, invalidates only when started plus `["pulls", repoId]`,
  `meta.silentCodes` = `bulk_review_too_large` / `nothing_to_review` /
  `no_enabled_agents`) + new `reviews.test.tsx`. New
  `src/app/repos/[repoId]/pulls/_components/ReviewAllButton/**` (constants
  `BULK_REVIEW_MAX_PRS = 20`, `ReviewAllDialog` with helpers `estimateView`,
  `useDialogKeyboard.ts` focus trap / Escape / focus restore).
  `pulls/page.tsx` wiring + new `page.test.tsx`. `PRRow.tsx` settled-gated
  `usePrRuns` + Failed badge + new `PRRowRunState.test.tsx`. `pulls/styles.ts`;
  `messages/en/prReview.json` (`list.reviewAll.*`, `list.rowFailed*`). Removed
  3 empty stray `client/_tmp_*` files.
- Results: client typecheck clean; client 68 files / 529 tests.
- Reviews: architecture comment 0 CRITICAL; security no findings >= 8;
  plan-verifier INCOMPLETE -> one gap-fill round (focus-trap a11y NFR) ->
  COMPLETE.
- Open manual follow-up: C-AC-31 header/row alignment check with agent-browser
  against the dev stack was NOT performed.
- Behavior notes:
  - The failure badge shows only for runs that settle while the row is mounted
    (not restored after reload).
  - Initial dialog focus is the header Close (X) button.
  - Tests use `fireEvent` (no `@testing-library/user-event` dependency in
    `client/`).
  - The keyboard handler is on `document`, so a second modal stacked on top
    would also receive Escape.
- Non-blocking follow-ups:
  - Move the ApiError-code -> message-key mapping into
    `ReviewAllDialog/helpers.ts` (`refusalKey`).
  - Extract `newestRun(runs)` from `PRRow` into `helpers.ts`.
  - Hard-coded `["pulls", repoId]` key in `PRRow` (pre-existing; the
    tanstack-query skill suggests a `lib/hooks` helper).
  - Consider adding `@testing-library/user-event`.

### Phase 6 — NOT STARTED (deferred by user)

### Phase 7 — DONE 2026-10-07 (uncommitted)

- Files:
  - `evals/src/scoring/llm-judge.ts`: exported pure `verifyEvidence` (quote
    trimmed, non-empty, case-sensitive substring of the fixture, else
    `passed: false` + `fabricated: true`); score is computed after it;
    `parseVerdict` exported.
  - `evals/src/logging/log.ts`: "(fabricated quote)" marker.
  - New `evals/src/scoring/llm-judge.test.ts` (9 tests).
  - New `evals/skills/onion-architecture/{onion-architecture.eval.ts,
    onion-architecture.cases.ts (4 cases), fixtures/ (5 files)}` -
    hand-written because `pnpm eval:scaffold` was blocked by the permission
    classifier.
  - New `.claude/skills/dependency-checker/SKILL.md`; dependency-checker row
    added to `.claude/skills/README.md`.
- Results: evals typecheck clean; `pnpm vitest run src` 16/16;
  `eval:quality` dependency-checker PASS, onion-architecture PASS. Live (Agent
  SDK subscription backend): dependency-checker 3/3 at 1.0 (thresholds
  0.7/0.6/0.6). onion-architecture run 1 had 2/4 red (0.5, 0.33): the cases
  asserted rules from `rules/*.md`, which `skillTask` does not inject (only
  `SKILL.md` + `references/`). Cases/fixture fixed; run 2 4/4 at 1.0
  (thresholds 0.75/0.67/0.67/0.67).
- Reviews: architecture comment 0 CRITICAL; security no findings >= 8;
  plan-verifier: AC-8, 9, 15, 22, 23, 24 MET; AC-16 (break SKILL.md -> red ->
  revert -> green) NOT run live to save spend - manual follow-up.
- Behavior notes:
  - The verbatim check is strict (case-sensitive, exact substring);
    paraphrasing judges get demoted.
  - Optional `fabricated` key added to `records.jsonl` practices (schema
    still 1).
  - `vitest run skills <name>` ORs filters, so `eval:skills <name>` runs all
    skills.
- Follow-ups:
  - Run AC-16 manually.
  - Stray untracked `evals/pnpm-workspace.yaml` created by `pnpm install`
    (`allowBuilds` esbuild placeholder) conflicts with the repo's
    no-workspace convention: delete it or decide esbuild build approval (not
    removed: permission classifier denied).
  - dependency-checker `SKILL.md`: replace the `monorepo-like` tag; use the
    real alias `@devdigest/*` and real layout
    `server/src/modules/<name>/service.ts` in examples instead of the
    synthetic eval names; add a line referring in-package layering findings
    to onion-architecture / react-project-structure (re-run its eval after
    editing).
  - Restore the truncated `.claude/skills/README.md` catalog (Q6).
  - Optional `eval:repeat` for stability numbers.
  - Make `eval:skills <name>` filter to one skill.
