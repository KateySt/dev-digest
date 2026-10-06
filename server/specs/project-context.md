# Spec: Project Context — document discovery, attachment, and run-time injection

Spec ID: SPEC-04
Status: draft
Supersedes: none

Client-side counterpart (Project Context page, Context tabs, Prompt assembly
block): [`../../client/specs/project-context.md`](../../client/specs/project-context.md).

## Implementation status (2026-09-30)

Implemented and reviewed. `architecture-reviewer` approved after one fix
round (1 WARNING — a duplicated attach-table helper across the two Context
tabs, promoted to `client/src/lib/project-context.ts`; 1 SUGGESTION —
inconsistent `.nullish()` usage, fixed). `security-review` found and fixed
one **HIGH** finding — attached-document paths were persisted with zero
validation and later read with no containment check, an exploitable
path-traversal arbitrary-file-read through the LLM prompt and the run trace
UI — closed with `normalizeRelativePath` + `isAllowedDocumentPath` in
`setAgentDocuments`/`setSkillDocuments` (fail-closed) plus a
defense-in-depth `isWithinRoot` check in `ProjectContextRepository
.readDocument`. It also found and fixed one **MEDIUM** finding: the direct
document-read endpoint could read any file in the clone, not just
allowlisted markdown documents.

`plan-verifier`'s final verdict is **INCOMPLETE — for test coverage only.**
Every code-level item across this spec's and the client spec's full AC
surface was independently confirmed against source by direct inspection, and
one real regression it found (a stale `specs_read` fixture in
`server/test/contracts.test.ts`, broken by this feature's own contract shape
change) was fixed in a gap-fill round. What remains: **none of the ~57 ACs
across both specs have dedicated test coverage** — `test-writer` was
intentionally left out of this orchestration run. Two gaps matter enough to
name directly, not just "presumably fine but untested":

- **AC-28** (refuse a clone advance while project-context documents are
  locally modified) — the refusal logic itself is untested; only a
  supporting mock was added to an existing, unrelated test.
- **AC-29** (this feature's own stated proof — the same PR reviewed twice,
  with and without an attached document, produces different findings) — no
  fixture exists anywhere for this; it is currently unverifiable by any
  means.

`Status` above stays `draft`. Promoting it to `implemented` is outside this
write-up's scope — per this repo's spec convention, status only advances via
human review / PR merge, never as part of authoring or documenting a spec —
and it would be premature regardless while plan-verifier's own gate reads
INCOMPLETE. Whoever runs the deferred test-writer pass should treat AC-28
and AC-29 as the highest-priority gaps.

## Changelog

- 2026-09-30 — resolved the three open clarifications from the initial draft:
  tokenizer fallback marks counts `estimated` (AC-6, AC-8), empty documents are
  skipped at resolution (AC-17), and a clone advance is refused while
  project-context documents are locally modified (AC-28). Acceptance criteria
  renumbered to keep each section contiguous; no AC was removed.
- 2026-09-30 — initial version

## Problem and user

An agent author writes decision documents in the repo — specs, architecture
docs, incident insights — and the review agent never sees them. The reviewer
therefore flags code that actually complies with a documented decision, or
misses a violation of one, purely because the document was never in its
context. This is the **reviewer awareness gap**.

The prompt slot for closing that gap already exists and is unused:
`reviewer-core/src/prompt.ts` defines `PromptParts.specs?: string[]`, renders
it as a `## Project context` section with every entry delimiter-wrapped via
`wrapUntrusted('spec-N', …)`, and persists it as `PromptAssembly.specs`; the
shared `INJECTION_GUARD` in the system message already covers those blocks.
`server/src/modules/reviews/run-executor.ts` passes `specs: null` and
`specs_read: []` unconditionally, so nothing ever fills it. This feature is
the server-side wiring that fills it, plus the attachment state, token
accounting, and document editing behind it.

## Goals / Non-goals

**Goals**

- Discover every markdown document in a repo's clone that lives under an
  allowlisted path segment, and expose it with a source-folder tag and size.
- Let an agent or a skill own an **ordered** set of attached documents,
  addressed by repo-relative path.
- Report a per-document token count computed with the tokenizer of the model
  that will actually consume it, falling back to a marked estimate when no
  tokenizer exists for that model.
- Resolve the attached set per run and inject each document's full text, in
  order, into the existing `## Project context` prompt slot.
- Record in the run trace what was injected, and what was attached but not
  injected — missing, empty, or dropped for budget.
- Report a deterministic coverage metric and "used by" count per document.
- Let a user create, edit, and save markdown documents back into the repo's
  clone working tree, without those edits being silently destroyed by a later
  clone advance.

**Non-goals**

- No chunking, embedding, or vector retrieval over these documents; no
  relevance-based selection. Attachment is explicit, injection is whole-file.
- No new prompt-injection defense in `reviewer-core` — the `wrapUntrusted` +
  `INJECTION_GUARD` mechanism already covers this slot and is reused as-is.
- No background, scheduled, or webhook-driven sync. Refresh is manual.
- No automatic `git commit`, `git add`, or `git push` on save, and no
  server-side discard/revert of a local edit (see the design decision below).
- No UI behavior — that is the client spec.
- No change to how skills' own `enabled`/`source` trust model works
  (`skills.md`, SPEC-01).

## User stories

- As an agent author, I attach `specs/security-baseline.md` to the Security
  Reviewer so its next run judges the diff against our documented baseline
  instead of generic security advice.
- As a skill author, I attach `specs/public-api.md` to the `pr-quality-rubric`
  skill once, so every agent using that rubric inherits the document without
  re-attaching it per agent.
- As someone debugging a weak review, I open the run trace and read exactly
  which documents reached the model and which were skipped, and why.

## Acceptance criteria (EARS)

**Discovery and refresh**

- AC-1: WHEN the document list for a repo is requested, the system shall
  return every `*.md` file in that repo's clone whose repo-relative path
  contains a `specs/`, `docs/`, or `insights/` path segment at any depth,
  each with its repo-relative path, its source-folder tag, and its size.
  (verify via: integration test)
- AC-2: WHERE a repo has no clone on disk, the document list shall return an
  empty list plus a degraded indicator instead of raising an error. (verify
  via: integration test)
- AC-3: WHEN a refresh is requested for a repo, the system shall re-read that
  repo's clone working tree and return a freshly computed document list with
  an updated last-refreshed timestamp. (verify via: integration test)
- AC-4: WHEN the document list is requested without an explicit refresh, the
  system shall serve the most recent scan result and shall not start a
  scheduled or background re-scan. (verify via: unit test)

**Token accounting**

- AC-5: WHEN a document's token count is returned, the system shall compute it
  with the tokenizer of the model configured on the agent or skill the request
  is scoped to. (verify via: unit test)
- AC-6: IF no tokenizer is available for the configured model, THEN the system
  shall return a count computed by a documented heuristic estimate and mark
  that count as `estimated`. (verify via: unit test)
- AC-7: WHEN token counts are returned for a set of documents, the system
  shall also return the summed token total of the currently attached subset.
  (verify via: unit test)
- AC-8: WHEN any document contributing to a returned total carries an
  `estimated` count, the total shall itself be marked `estimated`. (verify via:
  unit test)

**Attachment state**

- AC-9: WHEN a client sets an agent's attached documents, the system shall
  replace the whole ordered set in one operation, persisting each entry's
  repo-relative path and integer order. (verify via: integration test)
- AC-10: WHEN a client sets a skill's attached documents, the system shall
  replace the whole ordered set in one operation, persisting each entry's
  repo-relative path and integer order. (verify via: integration test)
- AC-11: WHEN a run starts, the system shall re-resolve the agent's and its
  skills' attached documents from storage, so that attaching, detaching, or
  reordering a document takes effect on the next run with nothing cached on
  the agent row. (verify via: integration test)

**Resolution order**

- AC-12: WHEN resolving the document set for a run, the system shall place the
  agent's own attached documents first in their stored order, then documents
  inherited from each attached skill, ordered by skill order and then by
  document order within each skill. (verify via: unit test)
- AC-13: WHEN the same repo-relative path is reachable both directly and
  through one or more skills, the system shall inject it exactly once, at its
  earliest position in the resolved order. (verify via: unit test)
- AC-14: WHERE an attached skill is disabled, documents reachable only through
  that skill shall not appear in the resolved set. (verify via: unit test)

**Injection**

- AC-15: WHEN a run's resolved document set is non-empty, the system shall
  pass each document's full text, in resolved order, into `reviewer-core`'s
  existing `specs` prompt slot, with no chunking, no relevance filtering, and
  no mid-document truncation. (verify via: integration test)
- AC-16: IF an attached repo-relative path does not exist in the run's repo
  clone, THEN the system shall omit it from injection, record it as
  attached-but-not-injected in the run trace with a missing reason, and let the
  run complete normally. (verify via: integration test)
- AC-17: IF an attached document is empty or contains only whitespace, THEN
  the system shall omit it from injection, exclude it from the token total and
  the budget calculation, and record it as attached-but-not-injected with an
  empty reason. (verify via: unit test)
- AC-18: WHILE the resolved set's total token count exceeds the project-context
  token budget, the system shall drop whole documents from the end of the
  resolved order until the total is within budget, never truncating a document
  partially. (verify via: unit test)

**Run trace**

- AC-19: WHEN a run completes, the trace's `specs_read` shall list every
  attached document path together with its outcome — injected, or not injected
  with a reason of missing, empty, or dropped for budget. (verify via:
  integration test)
- AC-20: WHERE a run assembles no project context (no attachments, or a
  failed/cancelled run that never assembled a prompt), the existing trace
  producers shall still satisfy the run-trace contract with unchanged
  behavior. (verify via: unit test)

**Coverage and usage metrics**

- AC-21: WHEN a document's coverage metric is returned, it shall be the
  percentage of enabled agents and skills in the workspace that have that
  document attached directly or inherit it through an attached, enabled skill,
  out of all enabled agents and skills in the workspace. (verify via: unit
  test)
- AC-22: WHEN a document's "used by" count is returned, it shall count each
  agent once, counting agents with the document attached directly plus agents
  that inherit it through an attached, enabled skill. (verify via: unit test)

**Editing and write-back**

- AC-23: WHEN a document save is requested, the system shall write the new
  content to that path inside the repo's clone working tree and shall not
  create a git commit, stage the file, or push. (verify via: integration test)
- AC-24: WHEN a document create or save targets a path that does not end in
  `.md` or does not contain a `specs/`, `docs/`, or `insights/` path segment,
  the system shall reject the request without writing anything. (verify via:
  unit test)
- AC-25: WHEN a document create or save targets a path that resolves outside
  the repo's clone root, the system shall reject the request without writing
  anything. (verify via: unit test)
- AC-26: WHEN a document create targets a path whose parent directory does not
  yet exist inside the clone, the system shall create that directory together
  with the document in one operation. (verify via: unit test)
- AC-27: WHEN a document has been saved, its content, size, and token count
  returned by the next read shall reflect the saved content without requiring
  a manual refresh. (verify via: integration test)
- AC-28: IF advancing a repo's clone to `origin/<defaultBranch>` would move
  past project-context documents that are modified in the working tree and not
  committed, THEN the system shall refuse the advance, leave the working tree
  untouched, and report the list of blocking repo-relative paths. (verify via:
  integration test)

**The behavior this feature exists to prove**

- AC-29: WHEN the same pull request is reviewed twice by the same agent and
  model, once with a project-context document attached and once without, the
  two runs shall produce different findings. (verify via: integration test,
  against a fixed PR fixture and a fixed document fixture)

## Edge cases

- **Renamed document.** A rename is indistinguishable from a deletion at the
  old path — it takes AC-16's missing path, and the new path must be attached
  again. Attachment stores a path, never a content snapshot.
- **Document edited in git after attach.** Because attachment is by path, the
  next run injects whatever content the clone currently holds — including
  content that changed when the clone advanced to `origin/<defaultBranch>`.
- **A blocked clone advance the user cannot resolve in-app.** AC-28's refusal
  stands until the working-tree edit is either committed or reverted in the
  repo itself; this feature deliberately offers no server-side discard (see
  the design decision), so the refusal must name the blocking paths precisely
  enough for the user to act on them outside DevDigest.
- **Only non-project-context files are dirty.** A working tree modified
  outside `specs/`, `docs/`, `insights/` does not trigger AC-28 — the refusal
  is scoped to the documents this feature can write.
- **One oversized document.** A single document larger than the whole
  project-context budget is dropped entirely by AC-18 rather than truncated,
  which can leave the resolved set empty; the drop is still recorded per
  AC-19.
- **Every attached document is empty.** AC-17 removes all of them, so the
  resolved set is empty and no `## Project context` section is emitted, while
  the trace still lists each one as attached-but-not-injected.
- **Empty workspace for coverage.** With zero enabled agents and skills, the
  AC-21 denominator is zero; coverage is reported as not applicable rather
  than as `0%` or an error.
- **Two paths, identical content.** Dedup is by repo-relative path (AC-13),
  so the same text living at two allowlisted paths is injected twice if both
  are attached.
- **Overlapping allowlist segments.** A path like `docs/specs/api.md` matches
  two allowlisted segments; it is one document with one source-folder tag, not
  two list entries.

## Non-functional requirements

- **Security — path traversal.** Every create/save path is validated against
  the clone root (AC-25); document paths arrive from the client and are
  untrusted input, not just display strings.
- **Security — injection surface.** Document content reaches the model as
  untrusted data inside `<untrusted source="spec-N">` blocks covered by the
  existing `INJECTION_GUARD`. Documents are read from the repo's clone, which
  `repo-intel` advances to `origin/<defaultBranch>` — so a PR author cannot
  introduce a new project-context document through the PR branch alone. This
  property is a consequence of the clone's branch, not an enforced check, and
  should not be relied on as an access control.
- **Durability of user edits.** A user's saved document is never destroyed by
  an automated action of this tool: AC-28 makes the clone-advance path refuse
  rather than overwrite.
- **Performance.** Document discovery and token counting sit on an
  interactive path (the Project Context page and both Context tabs). Token
  counts must be reusable between requests for unchanged content rather than
  recomputed per keystroke or per list render.
- **Observability.** Every per-document outcome of a run (injected, missing,
  empty, dropped) is visible in the persisted trace (AC-19) — debugging a weak
  review must not require re-running it.

## Inputs and provenance

- [deterministic: filesystem scan of the repo clone] Document list — paths,
  source-folder tags, sizes; read via the clone path already tracked on the
  `repos` row.
- [deterministic: tokenizer or heuristic estimate, no model call] Per-document
  and total token counts, plus the `estimated` marker (AC-6, AC-8).
- [deterministic: git working-tree status of the clone] The blocking-path list
  behind AC-28.
- [deterministic: database aggregate] Coverage metric and "used by" counts.
- [reused: `reviewer-core/src/prompt.ts`] The `PromptParts.specs` slot, the
  `## Project context` section, `wrapUntrusted`, and `INJECTION_GUARD` — all
  already implemented; this feature supplies input to them and adds no new
  prompt structure.
- [reused: existing run trace] `PromptAssembly.specs` and `specs_read`, both
  already on the contract.
- [new: 0 LLM calls] This feature makes no LLM call of its own. Its only
  model-side effect is a larger input to the review call that already happens.

## Untrusted inputs

- **Document content** is untrusted. It is injected only inside
  `wrapUntrusted`-delimited blocks, which already escape any embedded
  `</untrusted>` closing tag, and the system prompt's `INJECTION_GUARD`
  already instructs the model to treat delimited content as data. No
  additional per-document sanitization or pattern matching is introduced —
  consistent with the comment in `prompt.ts` that hardening belongs in the one
  shared guard, not in downstream pattern matching.
- **Document paths** are untrusted, both when attached and when saved: they
  are validated for extension, allowlisted segment, and containment within
  the clone root (AC-24, AC-25) before any read or write.
- Attached document content is never executed, never parsed as configuration,
  and never used to derive agent settings.

## Module interactions / API contracts

- **client → server (REST).** The client needs, at minimum: list documents for
  a repo (with tags, sizes, token counts and their `estimated` flag, coverage,
  used-by, and a locally-modified marker), refresh a repo's document list,
  read one document's content, create/save a document, and replace the whole
  ordered attached set for an agent and for a skill. The attached-set endpoints
  follow the existing whole-set-replacement shape used by
  `POST /agents/:id/skills` (`skills.md`, SPEC-01) rather than per-item
  add/remove.
- **server → reviewer-core.** `run-executor.ts` fills the existing
  `PromptParts.specs: string[]` instead of passing `null`. No new field, no
  signature change to `reviewPullRequest`.
- **server → repos / repo-intel.** Document discovery reads the clone path
  already tracked on the `repos` row, the same source `repo-intel`'s
  `readClone` uses. This feature adds no new clone, fetch, or checkout
  operation, but it does add one constraint on an existing one: `repo-intel`'s
  manual re-analyze, which advances the clone to `origin/<defaultBranch>`,
  gains the AC-28 refusal. That path already reports a degraded, non-throwing
  outcome for other unmet preconditions, so the refusal is a new outcome of
  the same shape rather than a new error class.
- **Shared contract change.** `specs_read` is currently
  `z.array(z.string())` in `src/vendor/shared/contracts/trace.ts`; AC-19 needs
  a per-entry outcome and reason, so the entry type changes. Two constraints
  from `server/INSIGHTS.md` apply: the identical edit must be applied by hand
  to **both** `server/src/vendor/shared/contracts/trace.ts` and
  `client/src/vendor/shared/contracts/trace.ts` (there is no sync script and
  no owning package), and any newly added field must be `.nullish()` unless
  every existing producer fills it — `trace-builder.ts` and the failed-run
  path in `run-executor.ts` both build traces with no project context (AC-20).

## Design decisions

- **Save writes to the working tree only, no commit — and the clone advance
  yields to it.** Requested judgment call. Saving a document writes the file
  into the clone's working tree and stops there: no `git add`, no commit, no
  push, no branch creation. Rationale — every existing use of the clone in
  this repo is read-only (`repo-intel`'s `readClone`), the tool is local-first
  with no push credentials assumed for the clone, and committing on the user's
  behalf is a much larger, harder-to-undo behavior than the feature needs in
  order to prove that an attached document changes review output. Because
  those edits are therefore unprotected by git, the clone-advance path refuses
  rather than overwrites (AC-28).
- **No server-side discard.** The refusal is resolved by the user committing or
  reverting the file in the repo itself. Offering an in-app "discard local
  changes" action would be the one destructive operation in an otherwise
  additive feature, and it is not needed to unblock anything.

## Open questions

None — all clarifications from the initial draft are resolved in the
acceptance criteria above (see the changelog).
