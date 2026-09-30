# Spec: Onboarding Tour — deterministic fact collection, one-call generation, caching, degradation

Spec ID: SPEC-06
Status: draft
Supersedes: none

Client-side counterpart (the repo-scoped Onboarding Tour page, its five
section cards, generation and degraded states):
[`../../client/specs/onboarding-tour.md`](../../client/specs/onboarding-tour.md).

## Changelog

- 2026-09-30 — initial version

## Problem and user

An engineer handed an unfamiliar repository spends their first days
reconstructing facts the codebase already encodes: which files everything
depends on, which entry point to read first, and what four commands actually
get the thing running. `README.md` rarely answers the ordering question, and
never answers it in a way that reflects the repo's real import graph.

DevDigest already computes almost everything needed to answer it and never
surfaces it. `repo-intel` indexes the repo once on clone and persists symbols,
the file-level import graph (`file_edges`), and a PageRank-derived importance
score per file (`file_rank`). Its facade already exposes
`getTopFilesByRank()` and `getCriticalPaths()`, both explicitly labelled
"T3: onboarding reading-path + critical paths" in
`modules/repo-intel/types.ts` — and **neither is called by anything today**.
An `onboarding` table (`repo_id` primary key, `json`, `generated_at`) exists
in `db/schema/context.ts` and is never read or written. An `onboarding`
feature-model entry, labelled "Onboarding Tour" with the description "Writes
the per-repo onboarding tour", is registered in the shared `FEATURE_MODELS`
registry and never resolved.

This feature is the server-side work that connects those pieces: collect the
deterministic facts, turn them into five prose sections with exactly one
structured LLM call, cache the result per repo, and degrade honestly when the
index or the model call is unavailable.

## Goals / Non-goals

**Goals**

- Collect the facts behind a five-part tour — architecture, critical paths,
  local run commands, a guided reading order, and first-task candidates —
  deterministically, from the persisted `repo-intel` index and the repo's
  clone working tree, with no model involvement.
- Order the guided reading path by the repo's own import graph, using the
  ranking already persisted in `file_rank`.
- Derive local run commands from real repo files, never from a model.
- Turn those facts into prose with **exactly one** structured LLM call.
- Cache the generated tour per repo and regenerate only on explicit request.
- Render a useful tour even when the index is partial or the model call
  fails, and report which of the two degraded.

**Non-goals**

- **Not a replacement for, or competitor to, `README.md`.** The tour is an
  opinionated orientation aid built from a ranked slice of the repo; it is
  deliberately incomplete and never claims to describe the repo exhaustively.
- **No editing of the tour.** It is generated and regenerated, never
  hand-edited. This deliberately avoids the "does regenerating destroy my
  edits" problem that `project-context.md` AC-28 had to solve for editable
  documents.
- **No per-user progress tracking** — no completion state, no persisted
  "step done" marks.
- **No background, scheduled, or webhook-driven regeneration.** Regeneration
  is a user action, mirroring `project-context.md` AC-4.
- **No tour history or versioning.** A regeneration overwrites the previous
  tour; `onboarding.repo_id` is a primary key and one row per repo is the
  schema's existing assumption.
- **Not agent-consumable context.** The tour is never injected into a review
  prompt and is not an input to `reviewer-core`. Its only consumer is the
  human-facing page in the client spec.
- **No share link.** Cut from v1 deliberately: the only auth provider in this
  product is `LocalNoAuthProvider` (`adapters/auth/local.ts`), so there is no
  access-control boundary for a shared link to cross, and the tour exposes
  repo structure. No share endpoint, no share token, no public route.
- **No change to the `repo-intel` indexing pipeline.** This feature is a
  reader of the existing index; it adds no walk, parse, graph, or rank step.
- **No clone-depth change.** See the hotness design decision below.

## User stories

- As an engineer handed an unfamiliar repo, I open the tour and learn which
  five to eight files to read first and why, without asking a teammate.
- As that engineer, I copy the run-locally commands one at a time and get the
  app running without opening `package.json` or `docker-compose.yml` myself.

## Acceptance criteria (EARS)

**Generation lifecycle and caching**

- AC-1: WHEN a tour is requested for a repo that has no stored tour, the
  system shall return an explicit not-yet-generated state rather than an
  error, and shall not enqueue a generation on its own. (verify via:
  integration test)
- AC-2: WHEN generation is requested for a repo, the system shall enqueue a
  background job and return an accepted response carrying the job id, without
  performing the generation inline on the request. (verify via: integration
  test)
- AC-3: WHEN generation is requested while a generation job for the same repo
  is already in flight, the system shall not enqueue a second job and shall
  return the in-flight job's id. (verify via: integration test)
- AC-4: WHEN a generation job completes successfully, the system shall
  replace that repo's stored tour in place with a new generated-at timestamp,
  retaining no previous version. (verify via: integration test)
- AC-5: WHILE a generation job is in flight, a request for the tour shall
  return the previously stored tour — or the not-yet-generated state when
  none exists — rather than blocking, erroring, or returning a partially
  written tour. (verify via: integration test)
- AC-6: WHEN a tour is requested without an accompanying generation request,
  the system shall serve the stored tour and shall not start a scheduled or
  background regeneration. (verify via: unit test)
- AC-7: IF a generation job fails, throws, or exceeds the job runner's
  timeout, THEN the previously stored tour shall remain unchanged and
  readable. (verify via: integration test)

**Deterministic fact collection**

- AC-8: WHEN the facts behind a tour are collected, the system shall derive
  them exclusively from `repo-intel`'s persisted index and the repo's clone
  working tree, making zero LLM calls during collection. (verify via: unit
  test)
- AC-9: WHEN the guided reading path is computed, the system shall order
  files by `PageRank × (1 + hotness)` descending, reading both factors from
  the persisted `file_rank` rows rather than recomputing the graph. (verify
  via: unit test)
- AC-10: WHERE a file is a test, configuration, type-declaration, migration,
  or fixture file, it shall be excluded from the guided reading path and from
  the critical-paths list. (verify via: unit test)
- AC-11: WHEN the critical-paths facts are collected, the system shall read
  them through `repo-intel`'s existing facade rather than querying
  `file_edges` or `file_rank` directly, returning each entry as a
  repo-relative path. (verify via: unit test)
- AC-12: WHEN local run commands are collected, the system shall derive them
  only from files that exist in the clone — the `package.json` scripts block,
  the service names declared in a compose file, and `.env.example` — and
  shall not synthesize a command from any other source. (verify via: unit
  test)
- AC-13: WHEN `.env.example` is present, the system shall report every
  environment-variable key name it declares, verbatim and unfiltered, without
  selecting, ranking, or annotating which keys matter. (verify via: unit test)
- AC-14: IF none of `package.json`, a compose file, or `.env.example` exists
  in the clone, THEN the local-run facts shall be empty and the system shall
  emit no command. (verify via: unit test)
- AC-15: WHEN a tour is stored, it shall record both the number of files the
  index actually covers and the number of source files discovered in the
  repo, as two distinct figures. (verify via: unit test)

**The single LLM call**

- AC-16: WHEN a generation job runs to completion, the system shall make
  exactly one structured LLM call for the whole tour, regardless of how many
  sections the tour contains. (verify via: unit test)
- AC-17: WHEN the generation job resolves its model, it shall use the
  workspace's configured override for the `onboarding` feature-model id, and
  fall back to that id's registry default when no override is set. (verify
  via: unit test)
- AC-18: WHEN the model returns, the system shall validate the response
  against the tour's declared schema, and shall treat a response that fails
  validation as an LLM failure per AC-24. (verify via: unit test)
- AC-19: WHERE the generated prose refers to a repo-relative file path, that
  path shall be one of the paths supplied to the model in the deterministic
  facts; a path absent from those facts shall not be presented as a repo
  file. (verify via: unit test)
- AC-20: WHEN the architecture diagram is generated, the system shall persist
  the model-authored diagram source together with the deterministic node and
  edge list that the client falls back to when that source fails to render.
  (verify via: unit test)
- AC-21: WHEN a generation job completes, the system shall record the token
  usage and cost of its single LLM call on the run's existing cost-accounting
  path. (verify via: integration test)

**Degradation**

- AC-22: WHERE a repo has no clone on disk, the system shall report the tour
  as not generatable with an explicit missing-clone reason, and shall not
  enqueue a generation job, rather than raising an error. (verify via:
  integration test)
- AC-23: WHERE a repo's clone exists but its index state is partial,
  degraded, or failed, the system shall still generate a tour and shall mark
  the stored tour as degraded with the index-derived reason. (verify via:
  integration test)
- AC-24: IF the single LLM call fails, times out, or returns a response that
  fails schema validation, THEN the system shall persist the deterministic
  skeleton — every collected fact, with all prose fields absent — marked
  degraded with a model-failure reason, rather than storing nothing or
  retrying on the next read. (verify via: integration test)
- AC-25: WHEN a stored tour is degraded, the reason shall distinguish a
  degraded index from a failed model call, so that each can be reported with
  its own remedy. (verify via: unit test)
- AC-26: WHEN a degraded tour is served, it shall still carry every
  deterministic fact that was successfully collected — reading path, critical
  paths, run commands, and index counts. (verify via: integration test)
- AC-27: WHERE a repo exceeds the indexer's file cap, the system shall
  generate a tour over the partial index and mark it degraded, and shall not
  refuse generation on size grounds. (verify via: unit test)

## Edge cases

- **A repo larger than the indexer's cap.** `MAX_INDEXED_FILES = 5000` and
  `INDEX_SOFT_BUDGET_MS = 110_000` (`repo-intel/constants.ts`) mean a repo of
  the mockup's 12,450 files is partially indexed by construction, with status
  `partial` and, where the cap is the cause, the existing `repo_too_large`
  degraded reason. AC-27 makes this degrade rather than block, and AC-15
  forces both counts to be reported so the client cannot imply coverage the
  tour does not have.
- **Hotness is inert in v1.** `rank.ts` records an explicit prior decision:
  `rank = pagerank, hotness = 0`, because the clone is shallow
  (`CLONE_DEPTH = 1`) and there is no churn window to measure. AC-9's formula
  therefore evaluates to PageRank alone today. It is written multiplicatively
  so that populating the existing, already-reserved `hotness` column later
  changes the ordering with no schema and no formula change.
- **A repo with no import edges.** `dependency-cruiser` degrades to zero
  edges on a broken tsconfig or an exotic layout, and `computeFileRank` then
  falls back to a uniform score. The reading path is consequently arbitrary
  but non-empty; AC-23 marks the tour degraded via the index state, which is
  where that failure is already recorded.
- **A generation job that outlives its budget.** `JobRunner`'s hard timeout
  is 120 seconds. A model call that does not return inside it takes AC-7's
  path — the previous tour survives untouched — rather than leaving a
  half-written row.
- **A tour generated before the repo was re-indexed.** Nothing invalidates a
  stored tour when the index advances; per the no-background-refresh non-goal,
  the stored generated-at timestamp is the only staleness signal, and
  correcting a stale tour is an explicit regeneration.
- **A repo with `package.json` but no scripts block.** AC-12 yields no
  commands from that file; combined with a missing compose file and a missing
  `.env.example`, AC-14's empty outcome applies, and the section is honestly
  empty rather than populated with plausible invented commands.
- **A monorepo with several `package.json` files.** The facts are collected
  per repo, not per package, so a repo whose real run instructions live in a
  sub-package yields whatever the scanned files declare — an incomplete
  local-run section is the correct degraded outcome, not an invented one.
- **A model that returns valid JSON naming a file that does not exist.**
  AC-19 constrains prose to the supplied fact set; a path outside it is not
  presented as a repo file, so the client never renders a deep link to a
  non-existent file.
- **Every candidate file filtered out.** A repo consisting only of tests and
  configs has AC-10 remove every candidate, leaving an empty reading path;
  the tour is still stored and served, with that section empty.

## Non-functional requirements

- **Cost control.** Generation is the only LLM spend in this feature and is
  never triggered by a read (AC-1, AC-6) — opening the page cannot spend
  money. Exactly one call per generation (AC-16) bounds the cost of a
  regeneration to a single, attributable, priced call (AC-21).
- **Latency.** Reads are served from the stored row, so page load cost is one
  row read and is independent of repo size. All graph and ranking work happens
  at index time, not at request time — the property `repo-intel`'s README
  states as its reason for existing.
- **Job budget.** Generation must fit inside `JobRunner`'s 120-second hard
  timeout, and overrunning it must be non-destructive (AC-7). The prompt's
  fact payload is therefore bounded rather than proportional to repo size.
- **Security — no new exposure surface.** With no share link and no public
  route, the tour is reachable only through the same workspace-scoped request
  path as every other repo-scoped resource.
- **Security — untrusted repo content.** See *Untrusted inputs*; repo text
  reaching the model is delimited with the mechanism already used for every
  other untrusted prompt input.
- **Honesty of reported numbers.** AC-15's two distinct counts exist so that
  a partially indexed repo cannot be presented as fully covered. A tour must
  never imply completeness it does not have — the same discipline
  `project-context.md` applies to `estimated` token counts.
- **Observability.** A degraded tour records *which* stage degraded (AC-25),
  so diagnosing a poor tour does not require regenerating it.

## Inputs and provenance

- [reused: `repo-intel` facade] Guided reading path and critical paths, via
  the already-implemented `getTopFilesByRank()` and `getCriticalPaths()`, and
  index status via `getIndexState()`. Both rank-driven methods exist today
  with no caller; this feature is their first consumer and adds no pipeline
  work.
- [deterministic: persisted `file_rank` rows] The `PageRank × (1 + hotness)`
  ordering behind AC-9, computed at index time by
  `repo-intel/pipeline/rank.ts` via `graphology-metrics`, not at request time.
- [deterministic: persisted `file_edges` rows] The architecture diagram's
  fallback node and edge list (AC-20).
- [deterministic: filesystem read of the repo clone] `package.json` scripts,
  compose service names, and `.env.example` key names (AC-12, AC-13), read
  from the clone path already tracked on the `repos` row — the same source
  `repo-intel`'s `readClone` uses.
- [deterministic: index state] The indexed-versus-discovered file counts
  (AC-15) and the degraded index reason (AC-23).
- [reused: `settings` feature-models] The provider and model for the single
  call, resolved from the existing `onboarding` feature-model id (AC-17).
- [reused: existing `jobs` infrastructure] Enqueue, in-flight detection, and
  the 120-second timeout — the same `JobRunner` path
  `POST /repos/:id/resync` already uses.
- [reused: existing cost accounting] Token and cost recording for the single
  call (AC-21) via the existing price book; no new cost surface.
- [new: 1 LLM call] Exactly one structured call per generation, turning the
  collected facts into the five sections' prose plus the diagram source.

## Untrusted inputs

- **Repo file content and file paths are untrusted.** Paths and any excerpted
  source text sent to the model are repository-controlled and must be passed
  as delimited, guarded data using the same `wrapUntrusted` +
  `INJECTION_GUARD` mechanism already applied to every other untrusted prompt
  input in this codebase. No new prompt-injection defense is introduced —
  consistent with `project-context.md`'s decision that hardening belongs in
  the one shared guard, not in per-feature pattern matching.
- **A repo's own files must not be able to steer the tour.** A `README.md`,
  a comment, or a filename that contains instruction-shaped text is data. The
  practical containment is AC-19: prose may only name paths drawn from the
  deterministic fact set, so repo-authored text cannot cause the tour to
  present an arbitrary path as a real file.
- **The model's own output is untrusted downstream.** The prose, the
  per-file rationales, and especially the Mermaid diagram source are
  model-authored strings persisted verbatim into the `onboarding` row and
  later rendered by the client. They are never executed, never used to build
  a filesystem path, and never used to derive a setting. The client spec
  governs how they are rendered.
- **Repo content is never executed.** This feature reads files and never runs
  a repo script, matching `SimpleGitClient`'s existing "we NEVER execute repo
  code — only git ops" constraint. The run-locally commands are *displayed*
  text, never invoked by the server.

## Module interactions / API contracts

- **client → server (REST).** The client needs two operations: read a repo's
  stored tour — including its generated-at timestamp, both index counts, and
  any degraded status and reason — and request generation, which returns an
  accepted response with a job id (AC-2) and is also the "Regenerate" path.
  Generation follows the existing `POST /repos/:id/resync` shape: enqueue,
  respond accepted immediately, and let the client poll the read endpoint,
  rather than holding the request open.
- **server → `repo-intel`.** Read-only use of the existing facade
  (`getTopFilesByRank`, `getCriticalPaths`, `getIndexState`). This feature
  calls the facade and never the pipeline internals — `depgraph`, `rank.ts`,
  and `walk.ts` are documented as in-process and private to `repo-intel`
  ("Features never import this"). No facade signature changes.
- **server → LLM adapter.** One `completeStructured` call against a declared
  schema, following the `conventions` module's existing precedent. Per this
  project's standing convention, the prompt text lives in the module's own
  `prompts.ts`, never inline in `service.ts`.
- **server → `settings`.** Resolution of the `onboarding` feature-model id
  through the existing `resolveFeatureModel` helper. The registry entry
  already exists; no registry change is needed.
- **Existing schema, no migration.** The `onboarding` table
  (`repo_id` primary key, `json`, `generated_at`) already exists in
  `db/schema/context.ts` and is currently unused. Its `json` column is the
  natural home for the tour body, its facts, and its degraded status, so this
  feature is expected to need no new table and no new column — worth
  confirming during planning before any migration is written.
- **Shared contract.** The tour's response shape is new and must be added to
  the shared contracts. Two constraints from `server/INSIGHTS.md` apply:
  `server/src/vendor/shared` and `client/src/vendor/shared` are
  hand-maintained, byte-identical duplicates with no owning package and no
  sync script, so the identical edit must be applied to both by hand and then
  diffed to confirm they still match; and any field that not every producer
  fills must be `.nullish()` rather than required — which applies directly
  here, since a degraded tour (AC-24) omits every prose field that a healthy
  tour carries.
- **No new dependency.** Every library this feature needs is already a direct
  dependency of `server/`: `graphology` and `graphology-metrics` for the
  PageRank already computed at index time, `dependency-cruiser` for the import
  graph, and `simple-git` for clone access. Nothing is added to
  `package.json`.

## Design decisions

- **Hotness stays inert rather than deepening the clone.** `rank.ts`'s
  "Option B" decision (`rank = pagerank, hotness = 0`) is honored as-is.
  Enabling real churn-based hotness would require raising `CLONE_DEPTH` from
  1, which changes clone cost for every repo in the product — a
  disproportionate change to make in service of one feature's ordering.
  AC-9 keeps the multiplicative form so the switch is later a data change,
  not a redesign.
- **Deterministic commands, model-authored framing.** Run commands are
  extracted from real files (AC-12) because a hallucinated shell command is
  the most damaging output this feature could produce — a user will paste it
  into a terminal. The accepted cost is AC-14: a repo whose files declare
  nothing yields an honestly empty section rather than plausible fiction.
- **The diagram is model-authored, with a mandatory fallback.** The mockup's
  architecture diagram is a conceptual interpretation (client → entry point →
  routes → datastore), not a literal import graph, so a raw rendering of
  `file_edges` would not produce it. The accepted cost is that the diagram can
  be wrong, and that a syntactically invalid diagram must never blank the
  section — hence the persisted fallback list in AC-20.
- **A failed model call is persisted, not retried on read.** AC-24 stores the
  deterministic skeleton with a failure reason so that reads stay fast, the
  failure is visible rather than silent, and a failing model is not re-called
  — and re-charged — on every page view.

## Open questions

None — every clarification raised during the spec dialog was resolved before
this spec was written. The three decisions the dialog was required to close
are recorded above: the product definition and its non-goals (*Goals /
Non-goals*), the large-repo strategy (AC-15, AC-23, AC-27 and the first edge
case), and the no-clone and degraded behavior (AC-22 through AC-26).
