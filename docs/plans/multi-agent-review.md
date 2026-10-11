# Development Plan: SPEC-10 Multi-Agent Review & live statuses

> **Status: approved by the user on 2026-10-10. Execution mode: multi-agent (run-plan).**
> - Q1–Q3: the defaults are accepted. The migration adds `multi_agent_order`, `started_at` and `finished_at`. The StatsTab import is changed to `@/components/run-trace-drawer`. The SPEC-05 changelog note is a follow-up for spec-creator.
> - R1–R5 are accepted.
> - R6 is resolved: the design screenshots are in `docs/design/multi-agent-review/`.
>   - 01 and 05: Configure run with agents selected.
>   - 04: Configure run, empty state.
>   - 02: Results in Columns mode.
>   - 06: Results in Tabs mode with finding detail.
>   - 03: the PR-page agent picker.
>
>   T10–T12b implementers must `Read` these. Two deviations from the design are intended, per the specs: the header says "fan-out via shared queue" (not "worktrees"), and the "did not flag" cells carry no reason text.

## Before you run this: questions and recommendations

**Questions that need an answer before T2 (migration) starts.** Each one has a default the plan already assumes.

- **Q1. The schema needs more than the one FK the spec lists.** S-AC-19 (columns in selection order), S-AC-21 (wall-clock from creation to the last agent's completion) and C-AC-29 (elapsed time while running, surviving a reload) can't be computed from today's `agent_runs`. It only has `ran_at` (set at creation, which now means queued time) and `duration_ms`. There's no start time, no finish time and no order column.
  - **Default:** the same generated migration also adds three nullable columns to `agent_runs`: `multi_agent_order int`, `started_at timestamptz` and `finished_at timestamptz`.
  - **Alternative:** a `jsonb` column of agent ids on `multi_agent_runs` for the order, plus the two timestamps.
  - This is a gap in the spec's "Database" section. If you want the spec text updated too, that goes through spec-creator.
- **Q2. Promoting `RunTraceDrawer` touches one file outside the worktree-A boundary.** `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/StatsTab.tsx:9` imports the drawer by a deep relative path into the PR page folder.
  - **Default:** change that one import line to `@/components/run-trace-drawer`.
  - **Alternative:** leave a re-export at the old path so nothing under `agents/` changes.
- **Q3. Who writes the SPEC-05 changelog note?** The server spec says SPEC-05 should get one when this ships. That's a spec edit, so it belongs to spec-creator, not to any task here. It's left as a follow-up.

**Recommendations.** Each is folded into the plan as the default; reject any and I'll re-plan.

- **R1. Shared queue design (this resolves the "Nested limiters" edge case).**
  - Every agent job goes into the shared queue as soon as its `agent_run` row is created with status `queued`. That makes queue positions real for single, multi, bulk, rerun and MCP runs alike.
  - The diff and intent are prepared once per group, lazily. The first job of a group to get a slot starts the preparation; its siblings wait on the same cached promise.
  - If preparation fails, every run in that group is marked `failed` and its queued siblings are removed from the queue (S-AC-16).
  - The bulk path drops its own `PQueue(BULK_REVIEW_CONCURRENCY)` (`server/src/modules/reviews/service.ts:311`) and relies on the shared queue alone. A PR-level limiter would leave rows `queued` that aren't actually in the queue while slots are free, which the spec forbids.
  - The queue should be a small custom FIFO with remove-by-runId (for S-AC-17 cancel and positions) rather than p-queue, which can't remove a pending job.
- **R2. No change to reviewer-core source.** `ReviewOutcome.dropped` (`{finding, reason}[]`) is already returned (`reviewer-core/src/review/run.ts:112,223`). T3 only adds a test that pins this behaviour. The range-overlap helper is re-implemented locally in `multi-agent/helpers.ts`. That keeps reviewer-core's public API unchanged, which matters because `agent-runner` bundles it.
- **R3. Column findings reuse the existing `FindingRecord` shape** (`review-api.ts`). The promoted `FindingCard` (rationale, suggestion, accept/dismiss state, eval case) then renders them with no adapter.
- **R4. The PR-header agent picker is a new component colocated under `PrDetailHeader/_components/AgentPickerDropdown/`.** `src/components/run-review-dropdown` stays untouched, so the PR list row is unchanged (a client non-goal).
- **R5. Estimates endpoint: `GET /multi-agent-runs/estimates`.** Fastify matches the static path before `/:id`.
- **R6. There is no design mockup in the repo** (`docs/design/` doesn't exist). If you have the course mockups, save them to `docs/design/multi-agent-review/*.png` before T11/T12 run, and the implementers will `Read` them. Until then the plan relies on the specs' text: the wrap rule, "fan-out via shared queue" wording, and "—" for unknown values.
- **Skills catalog looks truncated.** `.claude/skills/README.md` has only 3 rows. I matched skills against each `SKILL.md` "When to use" section instead.

## Execution mode
- **Multi-agent pipeline**, structured for the `run-plan` skill: one `implementer` per task, owned paths don't overlap, and the DAG comes from `Depends-on`.
- Suggested place to save the plan: `docs/plans/multi-agent-review.md`.
- **Single-agent version:** run T1 → T14 in numeric order in one session. Owned paths become file groupings only.
- `run-plan` doesn't invoke test-writer, so every task writes its own tests (they're in its owned paths).

## Spec followed
- `server/specs/multi-agent-review.md` (S-AC-1 … S-AC-47)
- `client/specs/multi-agent-review.md` (C-AC-1 … C-AC-53)

## Requirements review
- Both specs say "Open questions: None". The new ambiguities are Q1–Q3 above.
- Recommendations R1–R6 are pending your accept/reject.

## Design reference
- None in the repo (see R6). Visual details taken from the spec text, which T10–T12 must meet:
  - Long `file:line` strings (finding cards, group members, disagreement row labels) must **wrap**, not truncate: `overflowWrap: "anywhere"`, `wordBreak: "break-word"`, `minWidth: 0`, and `minmax(0, 1fr)` grid tracks.
  - Columns mode scrolls horizontally with 5 or more columns.
  - Statuses are shown as text, not by color or icon alone.
  - Header wording: "fan-out via shared queue", never "worktrees" and never "p-queue". The existing `runs.json` key `page.meta` must change.
  - Unknown values render as "—", never "0s" or "$0.00".

## Scope & modules
- **server/**
  - `modules/reviews/`: `agentIds` path, queued status, the executor runs through the queue, structured grounding in the trace, reaper, in-flight checks.
  - New `modules/multi-agent/`: reads, list, cancel-all, estimates, pure grouping.
  - `platform/review-queue.ts`, `config.ts`, `container.ts`.
  - `db/schema/runs.ts` plus a generated migration.
  - `vendor/shared` contracts.
- **reviewer-core/**: one test only (R2).
- **client/**:
  - `/multi-agent` (Configure run) and `/multi-agent/[runId]` (results).
  - PR page header picker, queued status, drawer `running` prop.
  - `FindingCard` and `RunTraceDrawer` promoted to `src/components/`.
  - `lib/hooks`, `runs` messages, `vendor/shared` contracts.
- **Out of bounds:** `agent-runner/`, `server/src/modules/ci/`, `e2e/` (no AC requires a new flow).

## Architectural constraints
- **Onion rings** (`onion-architecture`):
  - `multi-agent/helpers.ts` is pure: no Drizzle, no Fastify, no container.
  - The service orchestrates; Drizzle code lives only in `repository.ts` / `repository/*.ts`.
  - `routes.ts` validates params, query and body with zod schemas. Don't hand-parse in handlers (server `AGENTS.md`). The existing `RunRequest.parse(req.body ?? {})` may stay, but S-AC-3/S-AC-4 must still come back as 400.
  - The queue is a platform singleton wired in `container.ts` (the composition root). Services reach it through `container.reviewQueue`, never by importing it as a module.
- **Module wiring:** the new module uses the fixed filenames (`routes.ts`, `service.ts`, `repository.ts`, `helpers.ts`, `constants.ts`) and is registered in `server/src/modules/index.ts`. `MultiAgentService` may use `ReviewService` for cancel (there's precedent: the executor already uses `IntentService`).
- **Shared contracts:** `vendor/shared` edits are applied by hand, identically in `server/src/vendor/shared` and `client/src/vendor/shared`.
  - Keep each tree's import style: server uses `./findings.js`, client uses `./findings`.
  - Afterwards, diff **only the touched files** (`trace.ts` is identical today; `review-api.ts` and `observability.ts` differ only in import extensions; `platform.ts` has other drift).
  - New optional fields are `.nullish()`.
- **Migrations:** use `pnpm db:generate` only. Never hand-edit or rename a committed migration, and never run migrations on boot.
- **Client placement** (`react-project-structure`):
  - Pages stay thin; each feature lives in a colocated `_components/<Name>/` with its own `*.test.tsx`.
  - Shared components go in kebab-case folders `src/components/finding-card/` and `src/components/run-trace-drawer/` with an `index.ts` barrel.
  - Hooks go only in `src/lib/hooks/`.
  - Use `@/` imports, never deep relative ones (user preference).
- **Do-not-touch:** `client/src/vendor/ui` (`nav.ts` already points at `/multi-agent`) and lock files.

## Relevant INSIGHTS.md
- `server/INSIGHTS.md` 2026-09-30 and `client/INSIGHTS.md` 2026-09-30: the two `vendor/shared` trees are not byte-identical, so diff only the files you touch (T1).
- `server/INSIGHTS.md` 2026-10-07:
  - Fastify delivers a missing body as `null`, so optional body fields need `.nullish()` (`RunRequest.agentIds`, the cancel body).
  - Run integration tests with `--no-file-parallelism`.
- `server/INSIGHTS.md` 2026-09-15: new contract fields are `.nullish()` unless every producer fills them (`RunTrace`'s grounding field, `ReviewRunResponse.multi_agent_run_id`).
- `client/INSIGHTS.md` 2026-09-24:
  - Wrapping `file:line` text (T10–T12).
  - Footers and counts reuse `SeverityCountBadges`, the same cluster used on every screen.
- `client/INSIGHTS.md` 2026-09-15:
  - A trigger whose detail loads lazily must distinguish "not loaded yet" from "loaded and empty" (the "Also flagged by" expand control).
  - Don't call a callback prop inside a `setState` updater.
  - After editing a barrel file, `git diff` it (hooks `index.ts`, `src/components` barrels).
- `client/INSIGHTS.md` 2026-10-07: TanStack `onMutate` runs a microtask late, which matters if the picker or cancel uses optimistic writes.
- `reviewer-core/INSIGHTS.md`: no entries.

## Skills the implementer will apply
| Skill | Why it applies | Key rule the implementer must not violate |
|---|---|---|
| onion-architecture | New server module, platform queue, container wiring | Dependencies point inward only; `helpers.ts` stays pure; no Drizzle outside repositories |
| fastify-best-practices | New and changed `routes.ts` | Zod route schemas; rate-limit the new POST cancel route like the review trigger |
| drizzle-orm-patterns | Schema change, repository queries, transaction in `createRunsIfIdle` | Parent row and children inserted in the same advisory-locked transaction |
| postgresql-table-design | New FK and columns | Nullable FK with `ON DELETE SET NULL` plus an index on `agent_runs.multi_agent_run_id` |
| zod | Contract changes in both trees | Optional fields `.nullish()`; `agentIds` min 1; mutual exclusivity gives 400 |
| tanstack-query | Every hook and polling change in `client/src/lib/hooks` (user preference: load it first) | Polling uses a functional `refetchInterval` (4000 ms) that stops on terminal states; no `onError` toasts on mutations |
| react-project-structure | New routes, promotions, colocated picker | Colocate first; promote to `src/components/` only because there's a second consumer |
| next-best-practices | `/multi-agent`, `/multi-agent/[runId]`, search params `?pr`, `?view`, `?trace` | Thin `page.tsx`; async params and search params conventions |
| react-best-practices | Columns, Tabs, drawer state across refetches | Stable keys; expanded, tab and drawer state survive polling |
| react-testing-library | Every new or moved `*.test.tsx` | Role- and label-based queries; `fetch` mocked; test `QueryClient` |
| engineering-insights | T14, after the live validation | Record gotchas in the INSIGHTS.md of the module where they happened |

## Steps

Each task lists: tag, ACs, module, depends-on, owned paths, action, skills, gotchas.

**T1 [P] Shared contracts (both trees)** → S-AC-1, S-AC-4, S-AC-12, S-AC-20, S-AC-24, S-AC-36–S-AC-41, S-AC-45, S-AC-47 (shapes), C-AC-47 (shape). Infrastructure for everything else.
- Module: server and client `vendor/shared`. Depends on: none.
- Owned paths: `{server,client}/src/vendor/shared/contracts/{platform,review-api,observability,trace}.ts`, `server/test/contracts.test.ts`.
- Action:
  - `RunRequest` gains `agentIds: string[]` (min 1, nullish).
  - `ReviewRunResponse` gains nullish `multi_agent_run_id`.
  - Rework `observability.ts`:
    - `AgentColumn.status` covers queued, running, done, failed and cancelled; columns gain `queue_position`, `error` and `tokens_in`/`tokens_out`, and their findings use `FindingRecord`.
    - New `FindingGroup` / `GroupMember` and `DisagreementRow` with `is_conflict`.
    - `ConflictTake.verdict` is a `Severity` or one of `not_flagged`, `failed`, `cancelled`, `pending`, and has no `note`.
    - `MultiAgentRun` gains PR identity, `in_progress`, `totals_partial` and `groups`.
    - New `MultiAgentRunSummary` (for the list), `AgentEstimates` (`review_concurrency` plus per-agent mean duration, mean cost and sample size, all nullable) and `MultiAgentCancelResponse`.
    - Fix the stale `POST /pulls/:id/multi-agent-run` comment.
  - `RunTrace` gains a nullish structured grounding field: kept, total, and `dropped[{title, file, start_line, end_line, reason}]`.
  - The `RunSummary.status` comment adds `queued`.
  - Contract test: a legacy trace parses with the new field absent (S-AC-41).
- Skills: zod.
- Gotchas: import extensions differ per tree; diff only the 4 touched file pairs.

**T2 [P] DB schema and generated migration** → S-AC-1 (FK); also S-AC-19, S-AC-21, C-AC-29 via Q1.
- Module: server. Depends on: none.
- Owned paths: `server/src/db/schema/runs.ts`, the new `server/src/db/migrations/00xx_*.sql`, `server/src/db/migrations/meta/*`.
- Action: add the nullable FK `agent_runs.multi_agent_run_id` → `multi_agent_runs` (set null) plus an index, and the Q1 columns. Run `pnpm db:generate`.
- Skills: drizzle-orm-patterns, postgresql-table-design.
- Gotchas: the journal already contains duplicate-numbered files (0009, 0010, 0011); don't touch them. Generate; never hand-edit.

**T3 [P] reviewer-core grounding output lock** → S-AC-40.
- Module: reviewer-core. Depends on: none.
- Owned paths: `reviewer-core/test/run.test.ts`.
- Action: add `test_run_returns_dropped_with_reasons`. It asserts that `reviewPullRequest` returns `dropped` entries carrying the finding's title, file and lines plus a reason, alongside `grounding`. No source change (R2). If the test shows a gap, the change goes in `src/review/run.ts` only and must stay additive.
- Skills: onion-architecture.
- Gotchas: `agent-runner` consumes reviewer-core; any source change must be additive.

**T4 [P] Shared review queue and config** → S-AC-9, S-AC-10, S-AC-11, S-AC-12, S-AC-17 (mechanics).
- Module: server platform. Depends on: none.
- Owned paths: `server/src/platform/review-queue.ts`, `server/src/platform/config.ts`, `server/src/platform/container.ts`, `server/test/review-queue.test.ts`.
- Action:
  - FIFO queue limited to `REVIEW_CONCURRENCY` (default 3; an invalid value falls back to 3 with a logged warning).
  - Operations: enqueue job (`runId`, `groupKey`), `onStart` hook (writes `running`), `position(runId)` (1-based), `remove(runId)` for queued cancel, effective `limit`.
  - Log enqueue, start and finish with the run id and queue position.
  - Expose one singleton as `container.reviewQueue`.
- Skills: onion-architecture, typescript-expert.
- Gotchas: `loadConfig` has no logger, so surface the warning flag and log it where a logger exists. A job that rejects must always free its slot.

**T5 [S] Reviews module: multi-run start, queued lifecycle, parallel executor, structured grounding** → S-AC-1–S-AC-9, S-AC-11, S-AC-12 (active runs), S-AC-13–S-AC-18, S-AC-40.
- Module: server. Depends on: T1, T2, T4.
- Owned paths: `server/src/modules/reviews/{routes,service,run-executor,repository,constants,helpers}.ts`, `server/src/modules/reviews/repository/*.ts`, `server/test/reviews-multi.it.test.ts`, `server/test/reviews-bulk.it.test.ts`, `server/test/reviews.it.test.ts`, `server/test/helpers/runs.ts`.
- Action:
  - **Start request:** `agentIds` path with dedupe that keeps first-occurrence order. Unknown, other-workspace or disabled ids → 400, nothing created. `agentIds` combined with `agentId` or `all` → 400.
  - **Atomic creation:** the parent row and its children (status `queued`, order) are created inside `createRunsIfIdle`'s advisory-locked transaction.
  - **In-flight checks** (`prIdsWithActiveRun`, `activeRunsForPull`) count `queued` as well as `running`. A 409 `review_in_progress` carries the in-flight run ids and, when present, the `multi_agent_run_id` in `details`.
  - **Executor (R1):** jobs are enqueued through `container.reviewQueue`, with per-group memoized diff and intent preparation and `Promise.allSettled` semantics.
  - **Every trigger goes through the queue:** single, `all`, `agentIds`, bulk (drop its `PQueue`), `rerunReview` (create its row `queued`) and MCP (via `runReview`).
  - **Status timestamps:** `started_at` is written when a job starts and `finished_at` on completion.
  - **Cancel:** `cancelRun` on a queued run removes it from the queue and marks it `cancelled` with no LLM call (extend `cancelRunIfRunning` to cover queued).
  - **Boot reaper:** marks both `queued` and `running` rows failed, with an error saying the server restarted.
  - **Trace:** written from `outcome.dropped` and `grounding`. A failure after the model responded keeps its tokens and cost.
  - **Active runs:** `GET /pulls/:id/runs/active` returns `status` and `queue_position`.
  - **Integration tests:** `test_multi_run_creates_parent_and_children`, `test_agent_ids_dedupe`, `test_agent_ids_invalid_400`, `test_agent_ids_mixed_400`, `test_single_agent_multi_run`, `test_legacy_body_unchanged`, `test_multi_run_409_details`, `test_multi_run_returns_immediately`, `test_concurrency_bound_across_triggers`, `test_queued_fifo_and_position`, `test_parallel_execution`, `test_shared_prep_once`, `test_failure_isolation`, `test_prep_failure_fails_all`, `test_cancel_queued_no_llm`, `test_boot_reaper_queued`, `test_trace_grounding_dropped`. Update the bulk tests (SPEC-05 AC-7 still holds at the default limit).
- Skills: onion-architecture, fastify-best-practices, drizzle-orm-patterns, zod.
- Gotchas:
  - `MockLLMProvider` needs a controllable delay to observe concurrency.
  - `RunLogger` fan-out of the shared pre-work must still write into every run's buffer.
  - A running cancel followed by the executor's own completion must not overwrite `cancelled` with `done`.
  - Don't touch `modules/ci/`.

**T6 [P] Pure grouping, disagreement and totals helpers** → S-AC-21, S-AC-25–S-AC-33, S-AC-35–S-AC-39, S-AC-43.
- Module: server. Depends on: T1.
- Owned paths: `server/src/modules/multi-agent/helpers.ts`, `server/src/modules/multi-agent/constants.ts`, `server/test/multi-agent-helpers.test.ts`, `server/test/fixtures/multi-agent-pr482.ts`.
- Action:
  - Implement exactly the specified link rule, title normalization (fixed stopword list, title length capped before tokenizing, linear-time with no regex built from input), same-run exclusion, union-find over the fixed edge order, rejection of merges that would put two findings from one agent in a group, representative choice, members kept verbatim, takes, `is_conflict`, totals, and null-not-zero estimate means.
  - Range overlap is implemented locally.
  - Tests:
    - `test_link_rule`
    - `test_title_normalization`
    - `test_same_run_never_linked`
    - `test_union_find_order`
    - `test_same_agent_merge_rejected`
    - `test_representative`
    - `test_members_verbatim`
    - `test_deterministic`
    - `test_pr482_fixture` (uses the synthetic Customer-Facing agent)
    - `test_every_group_row`
    - `test_takes_selected_only`
    - `test_take_verdicts`
    - `test_no_reason_text`
    - `test_is_conflict`
    - `test_totals_null_cost`
    - `test_estimates_null`
    - a performance check: 200 findings in under 50 ms
- Skills: onion-architecture, typescript-expert.
- Gotchas: no Drizzle or container imports. File paths are compared as plain strings (an accepted spec edge).

**T7 [S] Multi-agent module: routes, service, repository** → S-AC-12 (results), S-AC-19–S-AC-24, S-AC-34, S-AC-42, S-AC-45–S-AC-47.
- Module: server. Depends on: T5, T6.
- Owned paths: `server/src/modules/multi-agent/{routes,service,repository}.ts`, `server/src/modules/index.ts`, `server/test/multi-agent.it.test.ts`.
- Action:
  - Routes: `GET /multi-agent-runs/:id`, `GET /multi-agent-runs?pr_id=&limit=` (default 10), `POST /multi-agent-runs/:id/cancel`, `GET /multi-agent-runs/estimates` (last 10 `done` runs per enabled agent plus the effective limit).
  - All workspace-scoped; anything else is 404.
  - Queue positions come from `container.reviewQueue`; groups and rows are computed on read by T6's helpers.
  - Integration tests: `test_results_shape_and_order`, `test_results_null_not_zero`, `test_in_progress_partial`, `test_results_404`, `test_list_newest_first`, `test_accept_dismiss_member_only`, `test_estimates`, `test_cancel_all`, `test_cancel_all_terminal_noop`, `test_cancel_all_404`, `test_estimates_limit`.
- Skills: onion-architecture, fastify-best-practices, drizzle-orm-patterns.
- Gotchas: register the static `estimates` route so it can't be captured by `/:id`. Rate-limit the cancel POST.

**T8 [P] Promote FindingCard and RunTraceDrawer; drawer grounding and not-started states** → C-AC-44, C-AC-46, C-AC-47, C-AC-48.
- Module: client. Depends on: T1, T9i.
- Owned paths:
  - Move `src/app/repos/[repoId]/pulls/[number]/_components/{FindingCard,RunTraceDrawer}/**` to `src/components/{finding-card,run-trace-drawer}/**`, tests included.
  - Importers: `.../pulls/[number]/page.tsx`, `.../_components/DiffTab/DiffTab.tsx`, `.../_components/FindingsPanel/FindingsPanel.tsx`, `src/app/agents/[id]/.../StatsTab/StatsTab.tsx` (Q2).
- Action:
  - Move with behaviour unchanged.
  - The drawer shows kept/total plus a dropped list (title, file:line, reason). A legacy trace shows only "k/n passed".
  - A queued run with no trace shows "not started yet" instead of an error.
  - The PR page passes `running` for in-flight runs (C-AC-48).
- Skills: react-project-structure, react-testing-library, tanstack-query (the drawer uses `useRunTrace`).
- Gotchas: use `@/` imports; `git diff` every barrel; dropped-finding text is plain text.

**T9 [P] Client hooks** → C-AC-11, C-AC-18, C-AC-20, C-AC-23, C-AC-33, C-AC-51, C-AC-53 (data layer).
- Module: client. Depends on: T1.
- Owned paths: `client/src/lib/hooks/multi-agent.ts`, `client/src/lib/hooks/multi-agent.test.tsx`, `client/src/lib/hooks/reviews.ts`, `client/src/lib/hooks/reviews.test.tsx`, `client/src/lib/hooks/index.ts`.
- Action:
  - New hooks: `useMultiAgentRun(id)` (polls every 4 s while in progress and stops on terminal), `useMultiAgentRuns(limit)`, `useAgentEstimates()`, `useStartMultiRun()`, `useCancelMultiRun()`.
  - `ActiveRun` gains `status` and `queue_position`.
  - `usePrRuns` also polls while a run is `queued`.
- Skills: **tanstack-query (load first)**, react-testing-library.
- Gotchas: a 409's `details` reaches the UI through `ApiError.details`; mutations show no `onError` toast.

**T9i [P] i18n keys (runs namespace)** → infrastructure for the C-ACs in T8, T10–T12.
- Module: client. Depends on: none.
- Owned paths: `client/messages/en/runs.json`.
- Action: add every new string the client ACs list: Configure run, picker, column states, Tabs, "Also flagged by", disagreement cells and empty states, grounding/dropped, "Cancel all" confirmation, recent runs. Update `page.meta` to "fan-out via shared queue".
- Gotchas: no other task edits message files. Missing keys get reported and are added in T13.

**T10 [P] PR page picker and queued status** → C-AC-16–C-AC-20, C-AC-50.
- Module: client. Depends on: T9, T9i.
- Owned paths: `.../pulls/[number]/_components/PrDetailHeader/**` (including the new `_components/AgentPickerDropdown/**`), `.../_components/RunStatus/**`, `.../_components/RunHistory/**`.
- Action:
  - The header picker: checkbox per enabled agent with a "~Ns" estimate, a Clear action, a run button disabled at 0 checked, and on success navigation to `/multi-agent/<id>`. 409 and other errors are shown in place. "Configure agents…" goes to `/multi-agent?pr=<prId>`.
  - The selection is stored in `localStorage` keyed per workspace, ignoring ids that are no longer enabled.
  - `RunStatus` and `RunHistory` render `queued` with its queue position.
- Skills: react-project-structure, react-best-practices, react-testing-library, tanstack-query.
- Gotchas: the client has no workspace-id hook today; use `GET /workspace` (server `modules/workspace/routes.ts`), consumed through a hook from T9 or reported back. `RunReviewDropdown` and `PRRow` stay untouched (R4).

**T11 [P] Configure run page** → C-AC-1–C-AC-15, C-AC-53.
- Module: client. Depends on: T9, T9i.
- Owned paths: `client/src/app/multi-agent/page.tsx`, `client/src/app/multi-agent/_components/{ConfigureRun,RecentMultiRuns}/**`.
- Action:
  - PR dropdown lists open PRs of the repo selected in the sidebar (`useActiveRepo`, `usePulls`); `?pr` preselects only when valid.
  - Dashed empty state, agent cards, "—" for a missing estimate, Select all.
  - Queue-aware greedy total in `helpers.ts`, unit-tested, plus the "incomplete" label.
  - Run button states; a 409 links to the in-flight multi-run or to the PR page; double-submit guard; no-agents empty state.
  - Recent multi-runs list.
- Skills: next-best-practices, react-project-structure, react-testing-library, tanstack-query.
- Gotchas: replace the `FeaturePlaceholder` page. `?pr` is the PR id, not the PR number.

**T12a [P] Disagreement block and "Also flagged by" badge (leaf components)** → C-AC-38–C-AC-43.
- Module: client. Depends on: T1, T9i.
- Owned paths: `client/src/app/multi-agent/[runId]/_components/MultiAgentResults/_components/{DisagreementBlock,AlsoFlaggedBadge}/**`.
- Action:
  - Disagreement rows show one cell per selected agent with its severity label, "did not flag", "failed", "cancelled" or "pending". The toggle filters on `is_conflict` and exposes its state to assistive tech. Two empty states.
  - The badge expands into each member's original finding (sanitized markdown) with Accept/Dismiss acting on that member's id. Callbacks come in through props.
- Skills: react-project-structure, react-best-practices, react-testing-library.
- Gotchas: wrapping `file:line` text; titles and paths render as plain text.

**T12b [S] Results page shell, Columns and Tabs** → C-AC-21–C-AC-37, C-AC-44, C-AC-45, C-AC-51, C-AC-52.
- Module: client. Depends on: T8, T9, T9i, T12a.
- Owned paths: `client/src/app/multi-agent/[runId]/page.tsx`, `client/src/app/multi-agent/[runId]/_components/MultiAgentResults/**`, except T12a's two folders.
- Action:
  - Header, totals with partial and "—" handling, 404 state.
  - `?view` and `?trace` kept in the URL.
  - Columns: queued shows "Queued · #N in line" with cancel; running shows elapsed time (from `started_at`), skeleton and cancel; failed, cancelled and "No findings" states; footer with `SeverityCountBadges`.
  - Tabs: FindingCard actions with Learn disabled; clicking a Columns card switches to Tabs with that card focused and expanded.
  - "Cancel all" with confirmation.
  - The drawer gets `running` for queued or running runs.
  - Expanded cards, the selected tab and the open drawer survive polling.
- Skills: next-best-practices, react-project-structure, react-best-practices, react-testing-library, tanstack-query.
- Gotchas: columns use polling only, with no `EventSource` per column; horizontal scroll at 5 or more columns.

**T13 [S] Client reconciliation** → infrastructure; closes any C-AC gaps reported by T8–T12b.
- Module: client. Depends on: T8, T10, T11, T12b.
- Owned paths: `client/messages/en/runs.json`, plus files flagged by earlier reports.
- Action: add any missing i18n keys, then run the full `pnpm test` and `pnpm typecheck` in `client/`.

**T14 [S] Live validation and measurements (last step)** → S-AC-44, C-AC-49.
- Module: all. Depends on: T1–T13.
- Owned paths: the `## Measurements` table rows in `server/specs/multi-agent-review.md` only, no AC text. Optionally the module `INSIGHTS.md` files.
- Action:
  1. `pnpm db:migrate`, then `./scripts/dev.sh` with a model key configured.
  2. On seed PR #482, run Security Reviewer, Performance Reviewer and Test Quality Reviewer together.
  3. Check with `agent-browser` (see `e2e/README.md`) that columns move from queued/running to terminal without a reload, a failed agent doesn't hide the others, the "Also flagged by" badges and "Where agents disagree" block render, and every "View trace" shows tokens, cost and the grounding decision.
  4. Control run: Security Reviewer alone on the same PR.
  5. Record both runs' observed figures (wall-clock, sum of durations, tokens, cost, findings, groups, notes) without adjusting toward 3×.
  6. Then `engineering-insights`.
- Skills: engineering-insights.

**Batches by DAG:**
1. T1, T2, T3, T4, T9i
2. T5, T6, T8, T9, T12a
3. T7, T10, T11, T12b
4. T13
5. T14

## Test plan
- **Suites affected:** server-unit, server-integration (`pnpm exec vitest run .it.test --no-file-parallelism`, needs Docker), reviewer-core, client.
- e2e is not affected: no existing flow starts a review from the PR header (client spec edge case).
- **New or updated tests and what they cover:**
  - **server-unit:**
    - `server/test/review-queue.test.ts` (T4): S-AC-9–S-AC-12, S-AC-17.
    - `server/test/multi-agent-helpers.test.ts` (T6): S-AC-21, S-AC-25–S-AC-33, S-AC-35–S-AC-39, S-AC-43.
    - `server/test/contracts.test.ts` (T1): S-AC-41.
  - **reviewer-core:** `reviewer-core/test/run.test.ts::test_run_returns_dropped_with_reasons` (T3): S-AC-40.
  - **server-integration:**
    - `server/test/reviews-multi.it.test.ts` (T5): S-AC-1–S-AC-9, S-AC-11, S-AC-13–S-AC-18, S-AC-40.
    - `server/test/reviews-bulk.it.test.ts` and `server/test/reviews.it.test.ts` updated (T5): SPEC-05 regressions, active runs now report queued.
    - `server/test/multi-agent.it.test.ts` (T7): S-AC-12, S-AC-19–S-AC-24, S-AC-34, S-AC-42, S-AC-45–S-AC-47.
  - **client (colocated `*.test.tsx`):**
    - `ConfigureRun` and its `helpers` (queue-aware total), `RecentMultiRuns`
    - `AgentPickerDropdown`, `RunStatus`, `RunHistory`
    - `MultiAgentResults`, Columns and Tabs sub-components, `DisagreementBlock`, `AlsoFlaggedBadge`
    - moved `RunTraceDrawer` and `FindingCard` tests (extended for C-AC-46–C-AC-48)
    - `lib/hooks/multi-agent.test.tsx`
    - test names follow the C-AC they cover (e.g. `C-AC-42 shows only conflicts`)
- **Every task:** the module's typecheck must pass.
- **T14:** a live check with `agent-browser` against the running dev stack, beyond tests and typecheck. There's no mockup, so it checks against the spec's visual requirements (wrap, "—", wording).

## Open questions / risks
- Q1–Q3 above.
- Agent name after deletion: the agent FK is `set null`, so a deleted agent's column loses its name. The fallback is the trace's `config.agent`. Edited agents show their current name.
- The existing `POST /runs/:id/cancel` has no workspace check. That predates this spec; the new multi-run cancel must check the workspace (S-AC-46).
- Bulk diff preparation now runs per PR inside the queue slots, which is effectively bounded by `REVIEW_CONCURRENCY`, so there's no burst of 20 parallel diff loads.

## Explicitly out of scope
- Architecture review and security review: separate agents run them after implementation. Security points to watch: untrusted LLM text rendered as sanitized markdown or plain text, and workspace scoping.
- `agent-runner/`, `server/src/modules/ci/`, eval-suite queueing, new e2e flows, the SPEC-05 changelog note (spec-creator).

**Before you invoke `implementer`:** skim each step's AC list against the two specs yourself. Every one of the 47 S-ACs and 53 C-ACs should appear in at least one step above. This is the only check before implementation; plan-verifier can only run once there's code.
