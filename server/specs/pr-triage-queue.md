# Spec: Bulk review trigger + cached blast size on the PR list

Spec ID: SPEC-05
Status: draft
Supersedes: none

Client-side counterpart (the Triage queue toggle, the "Highest risk" sort
option, the per-row Run Review dropdown, the "Review all" button and its
confirm dialog):
[`../../client/specs/pr-triage-queue.md`](../../client/specs/pr-triage-queue.md).
That spec's acceptance criteria are referenced below as `C-AC-N`; this spec
does not restate them.

## Changelog

- 2026-09-30 — initial version

## Problem and user

A user with a backlog of unreviewed pull requests can only trigger a review
one PR at a time: `POST /pulls/:id/review` takes a single `prId`, so N PRs
means N round trips driven by N page visits. There is no endpoint that
triggers a review across a set of pull requests, and nothing on the server
can answer "what would that cost" before the calls fire. Separately, the PR
list endpoint returns no risk signal that exists *before* a review has run —
`score` is the latest review's score, so it is `null` for exactly the PRs a
triage view is meant to rank.

Both gaps are server-side; every surface that exposes them is in the client
spec.

## Goals / Non-goals

**Goals**

- A bulk review trigger that, for one repo, derives the set of `needs_review`
  pull requests itself and starts a review run per PR against all enabled
  agents — the same targeting the existing single-PR "Run all" path uses.
- Per-PR outcomes in the response (started / skipped / failed to start), so a
  partial result is reported rather than collapsed into one status code.
- A pre-flight figure the client can show before spending money: how many PRs,
  how many runs, and an approximate dollar cost derived from completed runs'
  recorded cost.
- A pre-review risk signal on `GET /repos/:id/pulls`: the size of the PR's
  **already-cached** blast radius, so the list can rank PRs that have never
  been reviewed.

**Non-goals**

- No auto-triggering of reviews on new or updated PRs. The existing
  `AutoTriggerStatus` indicator stays off and unwired.
- No server-side sorting or pagination of the PR list. Ordering stays entirely
  client-side over the fetched list (C-AC-6 … C-AC-9).
- No per-agent selection for the bulk trigger. It always targets all enabled
  agents; a specific agent is run per-PR through the existing endpoint.
- No scheduling, queue-depth management, or persistent job queue. A batch
  exists only for the duration of its request plus the background runs it
  started.
- No automatic retry of a failed run, and no "retry the failures of batch X"
  endpoint. Re-running is a per-PR action.
- No blast-radius computation triggered by the PR list. Uncached stays
  uncached.
- No caller-side token/diff analysis for the cost estimate — the estimate is
  historical, not predictive.

## Acceptance criteria (EARS)

**Bulk review trigger**

- AC-1: WHEN a bulk review is requested for a repo, the server shall derive
  the target set itself as that repo's pull requests whose derived review
  status is `needs_review`, ignoring any client-supplied filter, search term,
  or PR list. (verify via: integration test)
- AC-2: WHEN a bulk review is requested, each target PR shall be started
  against all **enabled** agents, matching the targeting of the existing
  single-PR `{all: true}` path. (verify via: integration test)
- AC-3: WHEN a bulk review is requested, the response shall report one entry
  per PR in the derived set, each carrying that PR's outcome — started (with
  its run ids), skipped, or failed to start — rather than a single aggregate
  status. (verify via: integration test)
- AC-4: IF a target PR already has a review run that has not yet completed,
  THEN that PR shall be reported as skipped and no additional run shall be
  created for it. (verify via: integration test)
- AC-5: IF the derived set contains more than 20 pull requests, THEN the
  request shall be refused with the set's actual size and no run shall be
  created for any PR. (verify via: integration test)
- AC-6: IF the derived set is empty, THEN the request shall be refused as
  having nothing to do and no run shall be created. (verify via: integration
  test)
- AC-7: WHEN a bulk review starts N runs, no more than a fixed configured
  number of those runs shall execute concurrently; the remainder shall wait
  for a slot rather than all starting at once. (verify via: integration test)
- AC-8: IF one PR's run fails — at start, during pre-work, or during
  execution — THEN every other PR's run in the same batch shall still run to
  completion, and the batch shall not be rolled back. (verify via: integration
  test)
- AC-9: WHEN a bulk review is requested, the response shall return as soon as
  every run row exists, without waiting for any review to finish — matching the
  existing single-PR endpoint's fire-and-forget contract. (verify via:
  integration test)
- AC-10: WHEN a PR's run completes as part of a batch, its persisted review,
  findings, score, cost, and `lastReviewedSha` shall be written exactly as they
  are for a single-PR run, with no batch-specific variation. (verify via:
  integration test)
- AC-11: WHEN a bulk review is requested for a repo outside the caller's
  workspace, or for a repo that does not exist, the request shall be refused
  without creating any run. (verify via: integration test)

**Cost estimate**

- AC-12: WHEN a cost estimate is requested for a repo's `needs_review` set, the
  server shall return the PR count, the enabled-agent count, the resulting run
  count, and an approximate total cost. (verify via: integration test)
- AC-13: WHEN the approximate total cost is computed, it shall be the mean
  recorded cost of completed review runs multiplied by the run count. (verify
  via: unit test)
- AC-14: IF no completed review run has a recorded cost, THEN the estimate
  shall return the counts with the cost reported as unavailable, never as
  zero. (verify via: unit test)
- AC-15: WHEN the estimate is returned, it shall be marked as approximate so
  the client cannot render it as an exact figure. (verify via: unit test)
- AC-16: WHEN the estimate's PR count and a subsequent bulk trigger's derived
  set are compared, both shall use the same `needs_review` derivation, so the
  count the user confirmed cannot silently differ in kind from the set that
  fires. (verify via: integration test)

**Blast size on the PR list**

- AC-17: WHEN `GET /repos/:id/pulls` responds, each PR shall carry a blast-size
  figure derived from its blast radius as cached for the PR's **current** head
  sha. (verify via: integration test)
- AC-18: WHEN `GET /repos/:id/pulls` responds, no blast radius shall be
  computed, and no code index shall be built or read beyond the cached rows —
  a PR with no fresh cached blast shall report its blast size as absent.
  (verify via: integration test)
- AC-19: WHERE a cached blast radius is marked degraded, its blast size shall
  be reported as absent rather than as a small number. (verify via: unit test)
- AC-20: WHEN the blast-size field is added to the PR list contract, it shall
  be optional/nullish, so producers of the shared PR shape that know nothing
  about locally computed fields remain valid. (verify via: unit test)

## Edge cases

- **A PR whose head moved between estimate and trigger.** `needs_review`
  already covers "head moved since the last review" (`pulls/status.ts:51`), so
  a PR can enter or leave the set between the estimate call and the bulk call.
  AC-16 keeps the *derivation* identical; the count itself is a snapshot, and
  the authoritative set is the one AC-1 derives at trigger time.
- **A PR that is merged or closed mid-batch.** Its status is no longer
  `needs_review`, but its run may already be in flight. The existing per-PR
  path already permits reviewing a merged/closed PR (the client warns but
  allows), so a batch does not need to abort such a run.
- **Blast cache keyed by head sha.** `GET /pulls/:id/blast` is
  `getOrCompute`, cached per head sha (`blast/routes.ts:25`). A PR whose head
  just moved therefore has a *stale-sha* cached blast, which AC-17 must not
  report as current — absent is correct, and it degrades to diff-size ranking
  client-side (C-AC-8).
- **Zero enabled agents.** The run count is zero even though the PR set is
  not, so AC-12's estimate and AC-2's targeting both produce nothing to run;
  this is distinct from AC-6's empty PR set and must not be reported as the
  same refusal.
- **A repo with no clone or no code index.** Every PR's blast size is absent
  (AC-18/AC-19); the list still responds normally.
- **All target PRs already in flight.** Every entry is `skipped` (AC-4) and no
  run is created — a successful response with zero started runs, not an error.
- **Pre-work failure fans out.** `run-executor.ts`'s `failAll` marks *every*
  queued run for one PR as failed when shared pre-work (diff load, intent)
  fails. Within a batch that must stay scoped to the one PR whose pre-work
  failed, never to the batch's other PRs (AC-8).
- **New nullish field on the shared PR shape.** `server/INSIGHTS.md`
  (2026-09-15) records that adding a *required* field to the shared PR meta
  type breaks typecheck in the GitHub client, the mock client, and the offline
  fallback inside `GET /pulls/:id` — none of which know about fields computed
  from local review data. AC-20 exists because of that entry.

## Non-functional requirements

- **Cost containment.** Every run started by this feature is a paid LLM call.
  The batch cap (AC-5), the in-flight skip (AC-4), and the bounded concurrency
  (AC-7) are all cost-control mechanisms first and performance mechanisms
  second; none of them may be bypassable by repeating the request, since a
  repeat re-derives the set and re-applies the skip.
- **Cost honesty.** The estimate is historical and explicitly approximate
  (AC-15). The server must never present it in a shape that lets a client
  render it as a committed price, and must not substitute `0` for "unknown"
  (AC-14).
- **Bounded work per list request.** `GET /repos/:id/pulls` already does an
  `IN`-query plus JS grouping for score, findings, and cost on the grounds that
  "the list is small". The blast-size field must stay in that budget — cached
  reads only (AC-18), no per-PR fan-out.
- **Observability.** A batch must be reconstructable after the fact from the
  run rows it created and the logs it emitted: which PRs were targeted, which
  were skipped, and which failed. The existing per-run log buffer and trace are
  the mechanism; no batch-level record is introduced.
- **Isolation.** One PR's failure is contained to that PR's runs (AC-8). A
  batch introduces no shared transaction, no shared lock, and no shared
  mutable state across PRs.

## Inputs and provenance

- [deterministic: derived from DB] The `needs_review` target set — existing
  `deriveReviewStatus` over `lastReviewedSha` / `headSha` / `updatedAt`
  (`pulls/status.ts`). No model involved.
- [deterministic: computed by code] The cost estimate — mean of recorded
  `cost_usd` on completed runs × run count (AC-13).
- [reused: cached blast radius] The blast-size figure — read from the blast
  cache populated by earlier `GET /pulls/:id/blast` calls, never recomputed
  here (AC-18).
- [reused: existing review pipeline] Each PR's review itself — the existing
  single-PR run path, unchanged (AC-10). The bulk trigger adds set derivation,
  gating, and concurrency around it; it adds no new prompt and no new model
  call *kind*.
- [new: N × M LLM calls] Starting a batch costs one review run per target PR
  per enabled agent — the entire reason AC-4, AC-5, AC-7 and the client's
  confirm dialog (C-AC-15 … C-AC-19) exist.

## Untrusted inputs

- **Pull request titles, authors, branch names and diff content** reach the
  model through the existing review pipeline inside its existing
  `wrapUntrusted` delimiters and `INJECTION_GUARD`. This feature changes only
  *how many* reviews run, not what a review sends, so it introduces no new
  injection surface and adds no per-PR sanitization.
- **The repo id in the request path** is an identifier, not free text: it is
  resolved against the caller's workspace and refused if it does not belong
  (AC-11). It is never interpolated into a path, a query string, or a shell
  command.
- **Client-supplied PR lists are not trusted and not accepted.** AC-1 makes
  the server derive the set, so a caller cannot widen a batch beyond
  `needs_review`, cannot exceed the cap by splitting a list, and cannot target
  another repo's PRs by id.

## Module interactions / API contracts

- **Bulk trigger endpoint.** A new repo-scoped POST route in the `reviews`
  module, alongside the existing `POST /pulls/:id/review`. It takes the repo
  id and no target list (AC-1) and returns per-PR outcomes (AC-3). The exact
  path is the planner's call; `POST /repos/:id/pulls/review` is the shape
  consistent with the existing route naming. Note this is *not* the
  whole-set-replace shape of `POST /agents/:id/skills` — nothing is being
  replaced; N independent runs are being started, so the response is a
  per-item outcome list, not an acknowledgement.
- **Cost estimate.** A read endpoint returning the counts plus the approximate
  cost (AC-12 … AC-15). Kept separate from the trigger so the client's confirm
  dialog can render before anything is committed.
- **`GET /repos/:id/pulls` extended.** Gains the nullish blast-size field
  (AC-17, AC-20) next to the existing `score` / `cost_usd` / `findings` fields.
  No existing field changes shape.
- **Shared contract edit applies to both trees.** The PR meta shape lives in
  `server/src/vendor/shared` and `client/src/vendor/shared`, which both
  `server/INSIGHTS.md` and `client/INSIGHTS.md` confirm are hand-maintained
  byte-identical duplicates with no sync script. The blast-size field must be
  added to both by hand and the two files diffed afterwards to confirm they
  still match.
- **`blast` module consumed read-only.** The PR list reads the blast cache; it
  does not call `BlastService.getOrCompute` (AC-18). If no read-only accessor
  exists, adding one is preferable to the list reaching past the module.
- **`reviews` run executor reused unchanged.** The bulk path composes over the
  existing per-PR execution, so `run-executor.ts`'s `failAll` semantics stay
  scoped to a single PR's job list.

## Open questions

- [NEEDS CLARIFICATION] What exactly is "blast size"? The cached
  `BlastResult` (`repo-intel/types.ts:74`) exposes `changedSymbols`, `callers`
  and `impactedEndpoints`. Downstream **caller count** is the obvious single
  number, but impacted endpoints arguably matter more for risk. This must be
  one figure with one definition before AC-17 is implementable.
- [NEEDS CLARIFICATION] What is the fixed concurrency limit in AC-7? The
  behavior ("never more than the limit at once") is testable without the
  number, but the number itself is a cost and provider-rate-limit decision.
- [NEEDS CLARIFICATION] Should the cost estimate's mean be scoped — per agent,
  per model, per repo, or global across all completed runs? A global mean over
  a workspace running both a cheap and an expensive model will misprice any
  specific batch.
