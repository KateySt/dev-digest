# Spec: Memory Curation   |   Spec ID: SPEC-2026-10-12-memory-curation   |   Status: approved
Builds on: `specs/2026-10-12-memory.md` (SPEC-2026-10-12-memory), which listed curation as a
Non-goal and Future work. This spec replaces the design's "curated nightly" idea with a
**manual, human-approved** Curate action. Nothing in this spec runs on a schedule.

## Problem & why

Memory (SPEC-2026-10-12-memory) blocks duplicates only at write time: the Learn modal shows
up to 3 similar memories and offers **Merge into this** (AC-9/AC-10). Some duplicates and dead
entries still pile up:

1. **Duplicates that got past the write-time check.** Memories saved before embeddings were
   enabled are compared by weak full-text only. **Edit** can turn one memory into a near-copy
   of another, and edits are never checked. A global memory and a repo memory can say the same
   thing. Two near-identical memories waste the injection budget (AC-16) and show up twice in
   the trace.
2. **Dead memories.** "Stale" (unused for more than 60 days) is only a UI marker. Archiving is
   one memory at a time. A memory whose agent or skill was deleted ("Unlinked", AC-13) is
   never injected again, but it stays in the list with nothing pointing out that it is dead.

Today the user notices this on the Memory page and has to clean up by hand, one card at a time.

**Curation** is a button on the Memory page. It scans the memories in view and **proposes**
two kinds of change: merge groups of duplicates, and retire dead memories. The user reviews
each proposal and applies, edits or skips it. The curator never changes anything by itself.

## Decisions (from the design dialog, 2026-10-12)

- **Human decides everything.** Changes are never applied automatically. No scheduler, no
  background scan, no recompute on page open, no "N suggestions" badge. Work starts only when
  the user clicks **Curate**.
- **Scan = dry run.** The scan computes proposals and writes nothing to the database.
- **Apply one proposal at a time.** Each merge group and each stale memory is applied by its
  own click. There is no "apply all".
- **Merging archives, never deletes.** The memories that get folded in are archived, so every
  merge can be undone with Unarchive. Delete happens only when the user explicitly picks it,
  with a confirmation.
- **The user always keeps control after applying.** Every result stays editable and
  deletable through the existing Memory page actions (Edit / Delete / Archive / Unarchive,
  AC-27 of the Memory spec).
- **The merged text is drafted by an LLM** (like the Learn draft) and always edited and
  confirmed by the user. If the LLM fails, the draft falls back to deterministic text.

## Goals / Non-goals

- Goal: A **Curate** action on the Memory page that finds duplicate groups and stale
  candidates among the non-archived memories currently in scope (selected repo + global).
- Goal: A review screen where the user approves, edits, narrows or skips each proposal.
- Goal: Merges that do not lose data: sources, links and Learned back-links all carry over,
  and the merged-away memories stay recoverable.
- Goal: "Keep" on a stale candidate is remembered, so it does not reappear on every Curate.
- Non-goal: **Any automatic or scheduled curation**, including a nightly job, a run on server
  boot, or a lazy recompute when the page opens. Future work, and only if the user asks.
- Non-goal: **Contradiction detection** ("flag X" and "don't flag X"). Stays future work, as in
  the Memory spec.
- Non-goal: **Dead path-glob detection** (globs that no longer match any file in the repo).
  The server keeps no list of repo files, only `pr_files` per PR. Future work.
- Non-goal: Persisting curation runs or keeping a history or audit log of scans. Provenance
  lives on the memories themselves (`sources`, `merged_into`).
- Non-goal: Curating across repos the user is not viewing. A scan covers exactly the
  selected repo plus global memories.
- Non-goal: Changing the write-time duplicate check (AC-9/AC-10), retrieval, injection or
  CI export rules. Archived memories are already excluded everywhere.
- Non-goal: Persisting embeddings for memories that lack one (backfill). The scan may compute
  them in memory for comparison but never writes them (see AC-C4).

## User stories

- US-1: As a reviewer, I click Curate and see which memories duplicate each other, so I can
  fold each group into one clean memory.
- US-2: As a reviewer, I see which memories are dead (unused for 60+ days, or unlinked), and
  for each one I archive it, keep it, edit it, or delete it.
- US-3: As a reviewer, I can undo any merge by unarchiving the merged-away memories.

## Domain model changes

| Field (on `memory`) | Notes |
|---|---|
| `merged_into` | Nullable FK → `memory.id` (`ON DELETE SET NULL`). Set on a memory archived by a merge, pointing at the memory it was merged into. Cleared on Unarchive. |
| `kept_at` | Nullable timestamp. Set when the user picks **Keep** on a stale candidate. |

**Stale clock** (shared by the Memory page and curation): a memory is stale when
`greatest(coalesce(last_used_at, created_at), kept_at)` is older than 60 days. This changes
the Memory spec's stale definition (and the page's `stale` marker, default hiding and counts)
only by adding `kept_at`, so a kept memory stops looking stale everywhere.

**Stale candidate** (curation): a non-archived memory in scope that matches at least one reason:

- `unused`: `greatest(coalesce(last_used_at, created_at), kept_at)` is older than 60 days
  (`MEMORY_STALE_DAYS`). `kept_at` resets the clock, so a kept memory comes back only after
  another 60 unused days.
- `unlinked`: `applies_to_all_agents = false` and no rows in `memory_links`. Such a memory is
  never injected (AC-13). **Keep does not hide this reason**, because the memory stays dead
  until it is relinked or retired.

**Duplicate group**: a connected set of 2 or more non-archived in-scope memories where every
member is linked to at least one other member by a "similar" pair. A pair is similar when:

- both memories have an embedding (stored, or computed in memory during the scan) and their
  cosine similarity is ≥ `MEMORY_DUP_COSINE` (0.88, same constant as AC-9); or
- embeddings are unavailable, and the full-text score is ≥ `MEMORY_FTS_DUP_THRESHOLD` in
  either direction (same scoring as AC-9).

## Acceptance criteria

Verification hints in *[brackets]*: **unit** (vitest, no DB), **it** (`*.it.test.ts`,
testcontainers), **rtl** (client component test), **e2e**, **manual**.

### Scan

- **AC-C1**: The Memory page SHALL show a **Curate** button. WHEN the user clicks it, the
  client SHALL call `POST /memories/curate/scan` with the currently selected repo (or none),
  and SHALL show a progress state until the response arrives. *[rtl]*
- **AC-C2**: The scan SHALL consider only non-archived memories of the workspace in scope:
  global memories plus memories of the given repo. With no repo selected, the scope is global
  only. *[it]*
- **AC-C3**: The scan SHALL NOT write to the database: no content, embedding, `kept_at`,
  `last_used_at` or `updated_at` change. *[it]*
- **AC-C4**: WHEN embeddings are enabled, the scan SHALL compare memories by cosine
  similarity. It MAY compute embeddings in memory for rows that have none, but SHALL NOT
  persist them. WHEN embeddings are unavailable, or computing them fails, the scan SHALL fall
  back to full-text similarity for the affected pairs and SHALL still return a result. *[it]*
- **AC-C5**: The scan SHALL return duplicate groups (Domain model), each with its members
  (id, content, kind, scope, repo, confidence, links, path globs, last used, source count,
  `updated_at`), the highest pairwise similarity in the group, and a suggested **primary**
  member: highest confidence, then most sources, then most recently used. *[unit + it]*
- **AC-C6**: The scan SHALL return stale candidates, each with its reasons (`unused`,
  `unlinked`) and its last-used date. A memory that belongs to a duplicate group SHALL NOT also
  be listed as a stale candidate. The duplicate proposal takes precedence. *[unit + it]*
- **AC-C7**: The scan SHALL return at most 50 groups and 100 stale candidates, plus the
  totals, so the UI can say "showing N of M". A group SHALL contain at most 10 members: the
  suggested primary plus the 9 members most similar to it; the rest are left out of this
  scan's group and can surface on the next Curate. *[it]*
- **AC-C8**: WHEN the scan finds nothing, the review screen SHALL say so ("Memory looks
  clean") and offer to close. *[rtl]*

### Review screen

- **AC-C9**: The review screen SHALL show two sections, **Duplicates** and **Stale**, with
  counts. Each proposal SHALL be handled independently. There SHALL be no "apply all"
  control. *[rtl]*
- **AC-C10**: A duplicate group SHALL show every member's full content, kind, scope, links,
  confidence and last used date. It SHALL let the user change the primary member and remove a
  member from the group, and it SHALL hide the group if fewer than 2 members remain. *[rtl]*
- **AC-C11**: WHEN a group is expanded for merging, the client SHALL request a merged-text
  draft (`POST /memories/curate/merge-draft` with the current member ids). The server SHALL
  produce it with one LLM call (prompt in `modules/memory/prompts.ts`, model via
  `resolveFeatureModel`) that combines the members into one rule-and-why of at most 600
  characters, without inventing rules that no member states. The draft SHALL NOT persist
  anything. *[unit with mock LLM + it]*
- **AC-C12**: IF the draft call fails or exceeds 10 s, THEN the editor SHALL be pre-filled
  with the primary member's content and show a non-blocking notice. *[it + rtl]*
- **AC-C13**: Before applying, the user SHALL be able to edit the merged content, kind, scope,
  links, path globs and confidence of the result. The form is pre-filled with the merge
  defaults (AC-C15) and uses the same validation as the Learn/Edit form (Memory spec AC-11 and
  AC-12, errors shown inline). *[rtl]*
- **AC-C14**: A stale candidate SHALL show its content, reasons and last-used date, with the
  actions **Archive**, **Keep**, **Edit** (the existing Edit form) and **Delete**. Delete
  requires a confirmation. *[rtl]*

### Apply: merge

- **AC-C15**: `POST /memories/curate/merge` with `{ primary_id, member_ids, expected, result }`
  SHALL, in one transaction:
  update the primary with the confirmed `result` fields (content, kind, scope, repo, links,
  path globs, confidence); set its `sources` to the concatenation of all members' sources;
  set its `last_used_at` to the latest among members; re-embed it if the content changed
  (AC-22 of the Memory spec: a failed embedding is saved as null); repoint every
  `findings.memory_id` that pointed at a merged-away member to the primary; archive each
  merged-away member with `merged_into = primary_id`. *[it]*
- **AC-C16**: The merge defaults offered in the form SHALL be: links = union of members'
  links; `applies_to_all_agents` = true if any member has it; path globs = union, de-duplicated;
  confidence = max; kind = the primary's; scope = `repo` (the scanned repo) if any member is
repo-scoped, else `global`, so a repo-specific rule never silently becomes global. IF the union has more than 10 globs, or
  mixes a repo-scoped skill with a global scope, THEN the merge SHALL be rejected with 422
  (Memory spec AC-11/AC-12) and the user edits the form. *[unit + it]*
- **AC-C17**: IF any member was edited, archived or deleted after the scan (its `updated_at`
  differs from the `expected` value sent by the client), THEN the merge SHALL fail with 409
  and change nothing. The client SHALL tell the user and offer to re-scan. *[it + rtl]*
- **AC-C18**: The merge request SHALL carry the scanned `repo_id` (or none). The server SHALL
  reject (422) member ids that are archived, belong to another workspace, or are neither
  global nor in that repo; fewer than 2 or more than 10 members; a `primary_id` not among
  `member_ids`; and a `result` whose scope is not `global` or `repo` of the scanned repo.
  *[it]*

### Apply: stale

- **AC-C19**: **Archive** on a stale candidate SHALL archive it (same effect as Memory spec
  AC-27). **Delete** SHALL delete it (existing `DELETE /memories/:id`). **Edit** SHALL use the
  existing `PATCH /memories/:id`. *[it]*
- **AC-C20**: **Keep** SHALL set `kept_at = now` via `PATCH /memories/:id` with
  `{ kept: true }`. It SHALL change no other field. The memory SHALL stop being stale on the Memory page (marker, default list,
  counts) and SHALL NOT reappear with reason `unused` until another 60 days pass without
  use. *[it + rtl]*

### After apply

- **AC-C21**: After each apply action, the review screen SHALL remove the handled proposal
  and the Memory page list and counts SHALL refresh. The other proposals stay as they are,
  without a re-scan. *[rtl]*
- **AC-C22**: The detail panel of an archived memory with `merged_into` SHALL show "Merged
  into …" with a link to that memory. **Unarchive** SHALL clear `merged_into`, and the
  primary's content and sources SHALL stay as they are. *[rtl + it]*
- **AC-C23**: A merged primary SHALL behave like any memory: Edit, Delete, Archive and
  Unarchive all keep working (Memory spec AC-27). Deleting a primary SHALL set `merged_into`
  to null on its merged-away members, which stay archived. *[it]*

## Edge cases

- **The user edits a member in another tab between scan and apply.** The merge returns 409
  (AC-C17) and nothing changes.
- **One memory is similar to two others that are not similar to each other** (A~B, B~C,
  A≁C). They form one group (connected set). The user can remove members (AC-C10).
- **A global and a repo memory in one group.** Allowed. The primary's scope is the default and
  the user may change it. AC-C16 validation applies.
- **Two members were learned from the same finding.** Impossible, because a finding links to
  at most one memory (AC-7). Repointing (AC-C15) never collides.
- **A merged-away member is unarchived and becomes a duplicate again.** The next Curate
  proposes the group again. That is expected behaviour.
- **A large workspace** (around 1,000 memories in scope). See NFR. Comparing all pairs is
  acceptable at this size. Truncation per AC-C7.
- **The repo is deleted while the review screen is open.** Its memories cascade away (Memory
  spec). The next apply returns 404 or 409, and the client re-scans.
- **Prompt-injection text in a member's content.** Member content is passed to the
  merge-draft LLM as untrusted, wrapped data. The draft is only a suggestion the user edits
  and confirms, and injection rules are unchanged (Memory spec AC-17/17a).

## Non-functional requirements

- **Control:** the server writes only on an explicit apply request for one proposal. The scan
  and draft endpoints are read-only (AC-C3, AC-C11).
- **Reversibility:** a merge is undone through Unarchive (no data is dropped: sources are
  concatenated, archived members keep their content). Delete is the only irreversible action,
  and it is always confirmed.
- **Latency:** the scan finishes in ≤ 3 s p95 at 1,000 in-scope memories with stored
  embeddings. When missing embeddings must be computed, the time grows with the number of
  rows embedded (batched). The merge draft responds in ≤ 10 s or falls back (AC-C12).
- **Cost:** the scan makes no LLM call; it makes at most one batched embedding call, only for
  rows without an embedding. One LLM call per merge-draft request.
- **Offline / desktop (PGlite):** works with embeddings disabled (full-text path). No new
  extensions.

## Module interactions

| Module | Role |
|---|---|
| `server` | `modules/memory/`: `kept_at` added to the shared stale filter (`isStale`, list `baseWhere`, counts); curate scan (grouping + stale reasons), merge-draft (LLM, prompt in `prompts.ts`), transactional merge apply, `kept` patch; migration adding `merged_into` and `kept_at`. |
| `client` | **Curate** button on the Memory page; review screen (Duplicates / Stale sections, merge editor reusing the Learn/Edit form); "Merged into …" in the detail panel. Hooks in `lib/hooks/` (TanStack Query); i18n strings in `messages/en/memory.json`. |
| shared contracts | New scan, merge-draft and merge request/response schemas; `Memory` gains `merged_into` and `kept_at`; `UpdateMemoryBody` gains `kept`. The unused `CuratorMerge`/`CuratorResult` in `observability.ts` are either reshaped for this or removed (planner's call). Edit in the owning package, then re-vendor. |
| `e2e` | One flow: seed two near-duplicate memories → Curate → merge with an edited text → one memory remains, the other is archived with "Merged into". |

## Contracts (sketch; the final shapes are the planner's call)

```
POST  /memories/curate/scan         body: { repo_id? }
      → { groups: CurateGroup[], stale: StaleCandidate[], totals: { groups, stale }, mode: 'semantic' | 'text' }
POST  /memories/curate/merge-draft  body: { member_ids }            → { content, fallback: boolean }
POST  /memories/curate/merge        body: { repo_id?, primary_id, member_ids, expected: Record<id, updated_at>, result: MemoryInput }
      → Memory
PATCH /memories/:id                 body: … | { kept: true }        (existing route, new field)
```

## Open items left to the builder

- How pairwise similarity is computed (in SQL vs. in the app), and full-text pairing details.
- Whether merge-draft is requested when the user expands the group or by an explicit button
  (AC-C11 only requires that nothing persists).
- Exact layout of the review screen: a drawer, a modal or a sub-route of `/memory`.

## Calls made while writing this spec (not discussed in the dialog; review these)

- Stale reasons = `unused` (60 d) + `unlinked`. Dead path globs moved to Non-goals (no repo
  file list exists).
- Keep is remembered through a new `kept_at` column and resets the 60-day clock. Keep does
  not hide the `unlinked` reason.
- A new `merged_into` column records where an archived member went, so "Merged into …" and
  undo are clear.
- Missing embeddings are computed in memory during the scan but never saved (keeps the scan
  read-only).
- A memory in a duplicate group is not also listed as stale.
- Optimistic concurrency via `updated_at` (409 on change since the scan).
- Caps: 50 groups and 100 stale candidates per scan; at most 10 members per group.
- Keep also clears the page's stale marker (`kept_at` joins the shared stale clock);
  otherwise Keep would look like it did nothing.
- A mixed global + repo group defaults to the narrower `repo` scope; the result can only be
  global or the scanned repo.
- The merge draft uses the existing memory feature model; no new model setting.
- Deleting a merged primary clears its findings' "Learned" link (existing FK behaviour), so
  those findings become learnable again.

## Changelog

- 2026-10-12: Draft written after the design dialog.
- 2026-10-12: Implemented (uncommitted on `feat/add-memory`; plan
  `docs/plans/2026-10-12-memory-curation-plan.md`, migration `0028`). Clarified during build:
  a member archived after the scan gets 409 (its `updated_at` moved) and one already archived
  when sent gets 422; the full-text pair score is the exact AC-9 `ts_rank_cd` closed form
  computed in the app from `content_tsv` (an SQL self-join took minutes at 1,000 memories);
  the merge form blocks more than 10 path globs client-side; the merge-draft fallback keeps the
  primary the user chose. Status stays `approved` until `e2e/specs/11-memory-curation.flow.json`
  has run green.

## Future work

Scheduled or background curation (only if explicitly requested); contradiction detection;
dead path-glob detection (needs a repo file index); persisted embedding backfill; a curation
history or audit log.
