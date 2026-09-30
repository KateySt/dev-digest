# Spec: PR list Triage queue, "Highest risk" sort, per-row Run Review, "Review all"

Spec ID: SPEC-05
Status: draft
Supersedes: none

Server-side counterpart (the bulk trigger endpoint and its set derivation,
batch cap, in-flight skip, bounded parallelism and per-PR failure isolation;
the cost estimate; the cached blast-size figure on the PR list):
[`../../server/specs/pr-triage-queue.md`](../../server/specs/pr-triage-queue.md).
Its acceptance criteria are referenced below as `S-AC-N` and are assumed as
the data source; this spec does not restate them.

## Changelog

- 2026-09-30 — resolved the two remaining open clarifications: a manual
  filter/sort change while Triage queue is active deactivates the toggle
  rather than fighting the user or letting the view drift (AC-32); the risk
  order is explained via a per-row tooltip (AC-33). Status stays `draft`.
- 2026-09-30 — named the blast-size figure AC-7 tiebreaks on, now that the
  server spec has resolved it: the downstream-caller count (S-AC-17). Split
  the initial draft's AC-14 so the in-flight state and the settled outcome are
  one testable thing each; AC count unchanged. Toggle-vs-manual-change and
  order-explainability stay open and are deferred to planning.
- 2026-09-30 — initial version

## Problem and user

A user opening a repo with a backlog of unreviewed pull requests has two
problems on the Pull Requests list (`/repos/:repoId/pulls`). First, there is
no way to trigger a review from the list at all — "Run Review" lives only on
the PR detail page, so reviewing N PRs means N page visits. Second, the list
cannot rank what to review first: the SCORE column is the *latest review's*
score, so it is empty for exactly the PRs that need reviewing, and the only
sort options are `newest` / `oldest`.

The feature adds four things to the list: a Triage queue toggle that pins the
view to the actionable set in risk order, a "Highest risk" sort option, a
permanent per-row Run Review action, and a "Review all" bulk action that
starts a review on every PR currently needing one — behind a confirmation
that states what it will spend.

## Goals / Non-goals

**Goals**

- A **Triage queue** toggle in the list's header actions row: a sticky mode
  that pins the status filter to `needs_review` and the sort to "Highest
  risk", renders as active while on, and restores the user's previous
  filter/sort when turned off.
- A **"Highest risk"** sort option that ranks by signals available *before*
  any review has run — diff size, then cached blast radius — using the score
  only as a tiebreaker where one exists.
- A **per-row Run Review** dropdown on every PR row, always visible,
  independent of the Triage queue toggle, offering the same choices as the PR
  detail page and keeping the user on the list.
- A **"Review all"** button that starts a review on every `needs_review` PR
  after a confirm dialog stating the PR count, agent count, run count, and an
  approximate cost.
- The list's `sort` state moved into the URL, so a triage view survives reload
  and can be shared as a link — delivering what `page.tsx`'s own header
  comment already claims ("Filters/sort live in query (?status&sort)") but
  which the code does not do.

**Non-goals**

- No auto-triggering of reviews on new PRs. The header's `AutoTriggerStatus`
  indicator stays off and unwired.
- No checkbox multi-select and no "review selected N". "Review all" operates
  on the whole `needs_review` set, never on a user-picked subset.
- No new server-side sorting and no pagination. Sorting stays client-side over
  the already-fetched list.
- No scheduling or queue-management UI — no "run overnight", no queue depth,
  no batch history screen.
- No per-agent choice for the bulk action. It uses the same "all enabled
  agents" path as the existing single-PR "Run all".
- No automatic retry and no "retry failed only" bulk affordance. A failed row
  is re-run through its own Run Review dropdown.
- No new aggregate "total spent" figure anywhere in the list. The existing
  per-row COST column is the only spend surface.

## Acceptance criteria (EARS)

**Triage queue toggle**

- AC-1: WHEN a user activates the Triage queue toggle, the list shall set the
  status filter to `needs_review` and the sort to "Highest risk". (verify via:
  unit test)
- AC-2: WHILE Triage queue is active, the toggle shall render in a visibly
  active state that is also conveyed to assistive technology, not by styling
  alone. (verify via: unit test)
- AC-3: WHILE Triage queue is active, both the status filter and the sort
  shall be present in the page URL, so the view survives a reload and can be
  shared as a link. (verify via: unit test)
- AC-4: WHEN a user deactivates the Triage queue toggle, the list shall
  restore the status filter and sort that were active immediately before it
  was activated in this session. (verify via: unit test)
- AC-5: WHERE the page loads with triage URL state present and no prior
  in-session filter/sort to restore, the toggle shall render active, and
  deactivating it shall fall back to the page defaults — `needs_review` status
  and `newest` sort. (verify via: unit test)
- AC-32: WHEN Triage queue is active and the user changes the status filter or
  the sort by hand — not via the toggle itself — the toggle shall deactivate
  immediately, and the manually chosen filter/sort shall stand as the new
  view rather than being re-pinned or silently reverted. This deactivation
  does not restore the pre-activation state from AC-4; the user's manual
  choice is the new state. (verify via: unit test)

**"Highest risk" sort**

- AC-6: WHEN a user selects "Highest risk", the list shall order rows by
  descending diff size, counted as additions plus deletions. (verify via: unit
  test)
- AC-7: WHILE "Highest risk" is selected, PRs falling in the same size bucket
  as each other — the existing S/M/L bucket from `SIZE_SMALL_MAX` /
  `SIZE_MEDIUM_MAX` — shall be ordered by descending cached blast size (the
  server's downstream-caller count, S-AC-17), and then by ascending score.
  (verify via: unit test)
- AC-8: WHERE a PR has no cached blast size, its position within its size
  bucket shall be determined without it, rather than treating the absent
  figure as zero. (verify via: unit test)
- AC-9: WHERE a PR has no score, its position shall be determined by diff size
  and blast size alone; the absent score shall neither promote nor demote it.
  (verify via: unit test)
- AC-10: WHEN the sort dropdown is rendered, "Highest risk" shall appear
  alongside the existing newest/oldest options, labeled from a message key.
  (verify via: unit test)
- AC-33: WHILE "Highest risk" is selected, each row shall offer a tooltip,
  reachable by hover and by keyboard focus, stating the values used to rank
  it — diff size, cached blast size (or a stated "not available"), and score
  (or a stated "not yet reviewed") — so the order is explainable rather than
  arbitrary-looking. (verify via: unit test)

**Per-row Run Review**

- AC-11: WHEN the PR list renders a row, that row shall offer a Run Review
  dropdown with the same choices as the PR detail page — run all enabled
  agents, run one named agent, or go configure agents. (verify via: unit test)
- AC-12: WHERE Triage queue is inactive, every row shall still show its Run
  Review dropdown; the action shall not be gated on the toggle. (verify via:
  unit test)
- AC-13: WHEN a user starts a review from a row, the list shall stay on screen
  and shall not navigate to the PR detail page. (verify via: unit test)
- AC-14: WHILE a row's review run is in flight, that row shall show its
  in-progress state in place. (verify via: unit test)
- AC-15: WHEN a row's review run settles, that row shall reflect the outcome
  in place without a manual page reload — updated score, findings, status and
  cost on success, or a failure state on failure. (verify via: unit test)

**"Review all" — confirmation**

- AC-16: WHEN the list header renders "Review all", its label shall state the
  number of PRs currently needing review. (verify via: unit test)
- AC-17: WHEN a user activates "Review all", a confirmation dialog shall open
  stating the PR count, the enabled-agent count, the resulting total run
  count, and the approximate cost; no review shall start until the user
  confirms. (verify via: unit test)
- AC-18: WHEN a user dismisses or cancels the confirmation dialog, no review
  shall be started. (verify via: unit test)
- AC-19: WHERE the approximate cost is shown, it shall be presented as an
  approximation and never as an exact price. (verify via: unit test)
- AC-20: WHERE no completed run has a recorded cost yet, the dialog shall show
  the counts with no dollar figure, rather than showing `$0.00`. (verify via:
  unit test)
- AC-21: WHERE any target PR already has a review in flight, the dialog shall
  state separately how many PRs will be skipped for that reason. (verify via:
  unit test)
- AC-22: IF more than 20 PRs currently need review, THEN the dialog shall
  refuse the action, state that the set exceeds the maximum, and start no
  review — it shall not proceed with a truncated subset. (verify via: unit
  test)
- AC-23: WHERE no PR currently needs review, "Review all" shall be
  unavailable and state why, rather than opening a dialog for an empty set.
  (verify via: unit test)

**"Review all" — targeting and outcome**

- AC-24: WHEN "Review all" is confirmed, it shall target the `needs_review`
  set regardless of which status filter chip is active and regardless of any
  text in the search box. (verify via: unit test)
- AC-25: WHEN "Review all" is confirmed, each started PR's row shall show its
  run in progress and, on settling, its outcome in place — the same per-row
  states as AC-14. (verify via: unit test)
- AC-26: IF one PR's run fails, THEN the other PRs' runs shall continue and
  shall still show their own outcomes; one failure shall not present the batch
  as failed. (verify via: unit test)
- AC-27: WHEN a PR's run fails, the list shall offer no retry affordance
  beyond that row's own Run Review dropdown, and shall not retry
  automatically. (verify via: unit test)
- AC-28: WHILE any number of runs started by "Review all" are in flight, the
  page shall hold no more than a small fixed number of concurrent live
  connections to the server, and shall never open one per run. (verify via:
  integration test)
- AC-29: WHILE runs started by "Review all" are in flight, the list's own data
  requests — the PR list, refresh, navigation — shall continue to complete.
  (verify via: integration test)

**Cross-cutting UI rules**

- AC-30: WHEN any user-facing string in these surfaces is rendered, it shall
  come from a `next-intl` message key rather than a literal in the component.
  (verify via: unit test)
- AC-31: WHEN the header actions row renders the Triage queue toggle and
  "Review all" alongside the existing `AutoTriggerStatus` indicator, and when
  each row renders its Run Review dropdown, the row grid and the header shall
  stay aligned at the list's existing widths. (verify via: manual check)

## Edge cases

- **The filter half of the toggle is almost always a no-op.** `page.tsx:39`
  already defaults `status` to `needs_review`, so AC-1's filter change is only
  observable when the user has navigated to `all`, `reviewed` or `stale`
  first. The toggle's real effect on a fresh visit is the sort plus the pinned
  state — which is why AC-2 and AC-3 matter more than AC-1.
- **Sort was never URL-backed.** `sort` is local `React.useState`
  (`page.tsx:47`) while `status` reads from `useSearchParams`. AC-3 changes
  that, so an existing link carrying only `?status` must still load with the
  default sort rather than an undefined one.
- **A `needs_review` PR with a stale score.** `needs_review` means "never
  reviewed **or** head moved" (`pulls/status.ts:51`), so a head-moved PR has a
  leftover score from its previous head while a never-reviewed PR has `null`.
  AC-7 and AC-9 must therefore rank a mixed set where *some* rows have a score
  — not assume the column is uniformly empty in the triage view.
- **A cached blast keyed to a stale head sha.** The blast cache is per head
  sha (S-AC-17), so a just-pushed PR's blast size is absent even though the PR
  has been opened before. AC-8 keeps that from silently sorting it last.
- **Blast data is empty in seed data.** `client/INSIGHTS.md` (2026-09-24)
  records that every seeded PR returns empty `endpoints_affected` /
  `crons_affected`, so AC-7's blast tiebreaker cannot be visually confirmed in
  the local app against current seeds. It has to be covered by a test with a
  fixture carrying a non-empty blast, exactly as the Blast Radius panel's
  rendering path was.
- **Count drift between label and confirm.** AC-16's label count, AC-17's
  dialog count, and the set the server actually derives (S-AC-1) are three
  reads of the same thing at three moments. The dialog must not claim the
  server's outcome; the per-PR outcomes it gets back (S-AC-3) are
  authoritative for what the rows show.
- **Zero enabled agents.** The run count is zero even though the PR count is
  not, so AC-17's dialog would offer to start nothing. This is distinct from
  AC-23's empty PR set and must read differently — the fix is configuring an
  agent, not finding a PR.
- **All targets already in flight.** AC-21's skip count equals the PR count,
  so confirming starts nothing. This must present as "nothing to do", not as
  a failure.
- **Lazily loaded row data.** `client/INSIGHTS.md` (2026-09-15) documents a
  permanent deadlock in `PRRow`'s findings tooltip caused by collapsing "not
  fetched yet" and "fetched, and empty" into one state via `?? []`. Any new
  per-row state added for AC-14 — in-flight, settled, failed, absent — must
  keep "no run yet" distinct from "a run that produced nothing".
- **A merged or closed PR reached from a row.** The existing dropdown already
  warns-but-allows on merged/closed PRs via its `warnMerged` prop; a row for a
  non-open PR keeps that behavior rather than hiding the action.
- **Long, unbroken PR titles and branch names.** Adding a dropdown to each row
  narrows the title column. `client/INSIGHTS.md` (2026-09-24) records this
  class of bug being caught three times in one session: neither `nowrap`, nor
  a flex child's default `min-width: auto`, nor `text-overflow: ellipsis`
  creates a wrap opportunity, and a bare `1fr` grid track expands to
  max-content first. AC-31's alignment requirement covers the layout; the
  per-call-site fix is `overflowWrap: "anywhere"` + `wordBreak: "break-word"`
  + `minWidth: 0`, with `minmax(0, 1fr)` on the track.

## Non-functional requirements

- **Connection budget (the dominant risk).** `useRunEvents`
  (`lib/hooks/reviews.ts:340-378`) opens **one `EventSource` per run id, all
  in parallel**. Browsers cap concurrent connections per origin at roughly
  six on HTTP/1.1, so a batch of 20 PRs × 2 enabled agents subscribed that way
  would exhaust the pool and stall the page's own fetches — a hang, not a
  slowdown. AC-28 and AC-29 exist for exactly this; the list must use a
  bounded mechanism (a poll/refetch, or one aggregate stream) and the existing
  per-run fan-out must not be reused as-is from the list.
- **Cost safety.** "Review all" spends real money per run. The confirm dialog
  (AC-17), the explicit approximation (AC-19), the refusal above the cap
  (AC-22) and the honest no-history state (AC-20) are the guardrails; none may
  be skippable, and the dialog must never be pre-confirmed or remembered.
- **Sorting stays cheap.** AC-6 … AC-9 run client-side over the fetched list
  on every render of a small array; no per-row request may be introduced to
  compute a sort key.
- **Accessibility.** The Triage queue toggle is a real toggle with its pressed
  state exposed (AC-2); the confirm dialog traps focus, is dismissable by
  keyboard, and announces the counts and cost as text rather than as styling;
  each row's Run Review dropdown is keyboard reachable and its trigger has an
  accessible name that identifies *which* PR it belongs to, since 20 identical
  "Run Review" buttons are otherwise indistinguishable to a screen reader;
  AC-33's risk tooltip is reachable by keyboard focus, not hover alone.
- **Observability (user-facing).** A batch's result is readable from the rows
  themselves (AC-25, AC-26) without opening any PR. A failed row states that
  it failed rather than reverting to its pre-run appearance.

## Inputs and provenance

- [reused: `GET /repos/:id/pulls`] PR rows, including `additions`,
  `deletions`, `status`, `score`, `findings`, `cost_usd`, plus the new nullish
  blast-size figure (S-AC-17 … S-AC-20). Fetched through the existing
  `usePulls` hook; no new list request is introduced.
- [reused: cost estimate endpoint] The PR count, agent count, run count and
  approximate cost in AC-17's dialog — all from the server (S-AC-12 …
  S-AC-15). The client computes no cost figure of its own.
- [reused: existing single-PR run trigger] The per-row action in AC-11 uses
  the existing `POST /pulls/:id/review` path via the existing `useRunReview`
  hook and `RunReviewDropdown` component, rather than a new client-side flow.
- [reused: bulk trigger endpoint] The started/skipped/failed outcomes in
  AC-25 and AC-26 come from the server's per-PR outcome list (S-AC-3).
- [deterministic: client-side] The "Highest risk" ordering (AC-6 … AC-9), the
  label counts in AC-16, the filter/search narrowing, and the saved
  filter/sort restored in AC-4 — all computed locally from data already
  fetched.
- [new: N × M LLM calls] Confirming "Review all" starts one review run per
  target PR per enabled agent. This is the only model spend in this spec, and
  AC-17 … AC-22 exist to make it deliberate.

## Untrusted inputs

- PR titles, author names and branch names are untrusted display strings.
  They are rendered as text with the wrapping treatment from the edge case
  above, and never interpolated into markup or used to build a URL.
- Error text from a failed run is untrusted server/model output. It is
  rendered as text in the row's failure state (AC-14), never as HTML, and
  never used to choose which component to render.
- The counts and cost in AC-17's dialog are server-supplied numbers. They are
  formatted for display only and are never used to decide whether to bypass
  the cap or the confirmation — both of those are also enforced server-side
  (S-AC-5, S-AC-1), so a tampered client cannot widen a batch.

## Module interactions / API contracts

- **client → server.** Three calls: the existing PR list (extended with the
  blast-size field), the new cost estimate read, and the new bulk trigger —
  all specified in `server/specs/pr-triage-queue.md`'s *Module interactions*
  section. The bulk call sends **no PR list**; the server derives the set
  (S-AC-1), so the client cannot widen the batch.
- **Shared contract.** The PR meta shape gains the nullish blast-size field.
  Per `client/INSIGHTS.md` and `server/INSIGHTS.md`,
  `client/src/vendor/shared` and `server/src/vendor/shared` are
  hand-maintained byte-identical duplicates with no sync script — the same
  edit must be applied to both and then diffed to confirm they still match.
- **Existing surfaces extended, not replaced.** The toggle and "Review all"
  go into the existing header actions row next to `AutoTriggerStatus`; the
  sort option goes into `FilterBar`'s existing `sortOptions`; the row action
  goes into the existing `PRRow`. No new route is introduced.
- **`RunReviewDropdown` is promoted, not copied.** It currently lives under
  the PR detail page's `_components/`, so using it from the list requires
  moving it to a location both pages can import — not duplicating it. Where it
  lands is the planner's call under this repo's component-placement rules.

## Open questions

None. All clarifications are resolved: the blast-size figure AC-7 tiebreaks on
(downstream-caller count, S-AC-17), the toggle's manual-change transition
(AC-32 — deactivates, does not fight the user), and the risk order's
explainability (AC-33 — a hover/focus tooltip) were all closed on 2026-09-30.
