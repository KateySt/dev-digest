# Spec: Project Context — page, Agent/Skill Context tabs, Prompt assembly block

Spec ID: SPEC-04
Status: draft
Supersedes: none

Server-side counterpart (discovery, attachment storage, token counting,
run-time injection, trace fields):
[`../../server/specs/project-context.md`](../../server/specs/project-context.md).
All behavior below assumes that spec's acceptance criteria as the data source;
this spec does not restate them.

## Implementation status (2026-09-30)

Implemented and reviewed alongside the server spec above — see its
"Implementation status" section for the full `architecture-reviewer` /
`security-review` summary; both findings from that round (one HIGH, one
MEDIUM) were server-side path-validation issues, not client-only findings.

`plan-verifier`'s verdict is **INCOMPLETE — for test coverage only**, same as
the server spec: none of this spec's own ~28 ACs have dedicated test
coverage either, since `test-writer` was intentionally left out of this
orchestration run. The two most consequential untested behaviors both live
on the server spec — S-AC-28 (the clone-advance refusal) and S-AC-29 (the
differential-findings proof) — but every surface here (the Project Context
page, both Context tabs, and the trace's Prompt assembly block) is equally
unverified by any automated test.

`Status` stays `draft` for the same reason as the server spec: promoting it
is outside this write-up's scope (that happens via human review / PR merge),
and would be premature while plan-verifier's gate reads INCOMPLETE.

## Changelog

- 2026-09-30 — resolved the two open clarifications from the initial draft:
  reordering is disabled while the filter is active (AC-18) and "add folder" is
  a combined folder-plus-first-document flow (AC-6). Added the surfaces for the
  server's resolved decisions: `estimated` token totals (AC-16),
  locally-modified documents (AC-8) and the refused clone advance (AC-9).
  Acceptance criteria renumbered to keep each section contiguous; no AC was
  removed.
- 2026-09-30 — initial version

## Problem and user

An agent author has decision documents in the repo — specs, architecture docs,
incident insights — but no way to see them, to attach them to a reviewer, or
to confirm afterwards that they reached the model. Today the run trace's
Prompt assembly panel shows the system prompt, skills, memory, repo skeleton
and diff, but project context is always absent because nothing ever fills it.
The user needs three surfaces: a place to browse and edit the documents, a
place to attach an ordered subset to an agent or a skill with a visible token
cost, and proof in the trace of exactly what was injected.

## Goals / Non-goals

**Goals**

- A repo-scoped **Project Context** page: browse the discovered markdown
  documents, preview them rendered, edit and save them, create/upload new
  ones, and refresh the list on demand.
- A **Context** tab in the Agent editor and in the Skill editor: an ordered,
  filterable table to attach/detach documents, with a live token total and the
  untrusted-injection note.
- A permanently present, clearly labeled, expandable **"Project context —
  attached specs (untrusted)"** block in the run trace's Prompt assembly
  panel, plus the injected document paths in the Configuration section.

**Non-goals**

- No chunk/embedding/vector-search UI, and no "chunks" figure anywhere — the
  page's index footer reports a **token total**, not a chunk count.
- No background auto-refresh indicator or polling — refresh is a user action.
- No git UI: no commit, branch, diff, push, or discard-local-changes
  affordance. A locally modified document is surfaced (AC-8) but resolved
  outside DevDigest.
- No relevance/auto-suggest UI ("which docs should I attach for this PR") —
  attachment is fully manual.

## User stories

- As an agent author, I check two documents on the Security Reviewer's Context
  tab, see "≈ 317 tokens" update, and know what I just added to every run's
  prompt before I save.
- As a skill author, I attach one document to `pr-quality-rubric` and read the
  "SERIALIZES AS" box to see the literal block every inheriting agent will
  send.
- As someone debugging a weak review, I expand "Project context — attached
  specs (untrusted)" in the trace and read the exact text the model received.

## Acceptance criteria (EARS)

**Project Context page**

- AC-1: WHEN a user opens a repo's Project Context page, the left panel shall
  list every discovered document by filename, and the footer shall show the
  document count, the approximate token total across the listed documents, and
  how long ago the list was last refreshed. (verify via: unit test)
- AC-2: WHEN a user selects a document, the main panel shall render its
  markdown in Preview mode. (verify via: unit test)
- AC-3: WHEN a user switches the main panel to Edit, the document's raw
  markdown shall become editable with an explicit Save action; no change shall
  be persisted until Save is used. (verify via: unit test)
- AC-4: WHEN a save succeeds, the main panel shall return to Preview showing
  the saved content, and the document's token count and the footer total shall
  reflect the new content. (verify via: unit test)
- AC-5: WHEN a user creates or uploads a document at a path the server rejects
  (wrong extension, non-allowlisted folder, outside the repo), the page shall
  show the rejection as an inline validation error and leave the list
  unchanged. (verify via: unit test)
- AC-6: WHEN a user activates "add folder", the page shall require both a
  folder name and a first document name, and create the folder together with
  that document in one step. (verify via: unit test)
- AC-7: WHEN a user activates refresh, the page shall re-request the document
  list and update the footer's last-refreshed time. (verify via: unit test)
- AC-8: WHERE a document is modified in the repo's working tree but not
  committed, its row shall carry a locally-modified marker. (verify via: unit
  test)
- AC-9: WHEN an action that would advance the repo's clone is refused because
  project-context documents are locally modified, the page shall show the
  refusal naming each blocking document path. (verify via: unit test)
- AC-10: WHEN a document is selected, the page shall show its "Used by N
  agents" badge and its coverage indicator. (verify via: unit test)
- AC-11: WHERE the workspace has no enabled agents or skills, the coverage
  indicator shall render a not-applicable placeholder rather than `0`. (verify
  via: unit test)
- AC-12: WHERE the repo has no discovered documents, or has no clone yet, the
  page shall render an empty state instead of an empty panel or an error.
  (verify via: unit test)

**Agent editor — Context tab**

- AC-13: WHEN a user opens an agent's Context tab, it shall list every
  discovered document as a row with a drag handle, an attach checkbox, the
  filename, a source-folder tag, and a Preview action, with attached documents
  checked. (verify via: unit test)
- AC-14: WHEN a user toggles a checkbox or reorders rows, the tab shall
  persist the resulting whole ordered attached set. (verify via: unit test)
- AC-15: WHEN the attached set changes, the header badge shall show "N of M
  attached" and the footer shall show the approximate token total of the
  attached documents only. (verify via: unit test)
- AC-16: WHERE any attached document's token count is marked `estimated` by the
  server, the footer total shall be presented as an estimate rather than as an
  exact figure. (verify via: unit test)
- AC-17: WHILE text is present in the filter box, the table shall show only
  documents whose filename matches it. (verify via: unit test)
- AC-18: WHILE text is present in the filter box, each row's drag handle shall
  be inert and visibly dimmed, so reordering is only possible on the unfiltered
  list. (verify via: unit test)
- AC-19: WHEN a user activates a row's Preview, the document's rendered content
  shall open in place without navigating away from the Context tab. (verify
  via: unit test)
- AC-20: WHEN the Context tab is displayed, the footer shall state that
  attached documents are injected as an untrusted `## Project context` block
  into every run. (verify via: unit test)

**Skill editor — Context tab**

- AC-21: WHEN a user opens a skill's Context tab, it shall use the same row
  layout as AC-13, show a "N attached" badge, and state that any agent using
  this skill inherits these documents. (verify via: unit test)
- AC-22: WHEN a skill's attached set changes, the "SERIALIZES AS" box shall
  show the literal serialized block listing the attached documents in their
  current order. (verify via: unit test)

**Run trace — Prompt assembly**

- AC-23: WHEN a user expands a run's Prompt assembly panel, a block labeled
  "Project context — attached specs (untrusted)" shall be present regardless
  of whether that run injected any documents. (verify via: unit test)
- AC-24: WHEN a user expands that block for a run that injected documents, it
  shall show the full injected project-context text, and offer the same copy
  action as the panel's other blocks. (verify via: unit test)
- AC-25: WHERE a run injected no project context, that block shall render an
  explicit empty label rather than blank content. (verify via: unit test)
- AC-26: WHEN a run's trace is displayed, the Configuration section shall list
  the attached document paths under "Specs read", marking each document that
  was not injected with its reason — missing, empty, or dropped for budget.
  (verify via: unit test)

**Cross-cutting UI rules**

- AC-27: WHEN any document path is rendered in a table row, a trace line, or a
  badge, its text shall wrap inside its own box rather than overflow its
  container. (verify via: manual check)
- AC-28: WHEN any user-facing string in these surfaces is rendered, it shall
  come from a `next-intl` message key rather than a literal in the component.
  (verify via: unit test)

## Edge cases

- **Long, unbroken paths.** A path like
  `insights/incident-2026-04-checkout.md` has no spaces, so the browser treats
  it as one unbreakable word. `client/INSIGHTS.md` records this exact class of
  bug being caught three times in one session: neither `Badge`'s hardcoded
  `white-space: nowrap`, nor a flex child's default `min-width: auto`, nor
  `text-overflow: ellipsis` alone creates a wrap opportunity, and a bare `1fr`
  grid track expands to the content's max-content width before any child fix
  applies. AC-27 exists because of that entry; the per-call-site fix is
  `overflowWrap: "anywhere"` + `wordBreak: "break-word"` + `minWidth: 0`, and
  a containing grid track needs `minmax(0, 1fr)`.
- **Lazily loaded preview content.** If a row's Preview fetches content on
  demand, "not fetched yet" and "fetched, and it is empty" must be distinct
  states. `client/INSIGHTS.md` documents a permanent deadlock caused by
  collapsing them with `?? []` in a hover trigger's `disabled` check.
- **An attached document that no longer exists.** The Context tab's list comes
  from repo discovery, so a deleted document disappears from the table while
  still being attached server-side; the attached count and token total must not
  claim a document the table cannot show.
- **Filtering to zero rows.** The table's empty result is distinct from the
  repo having no documents at all (AC-12), and AC-18's dimmed handles apply to
  a zero-row table trivially — the badge's "N of M attached" still reflects the
  full set, not the filtered view.
- **An empty attached document.** The server skips it and excludes it from
  totals, so a document visible and checked in the table can contribute zero
  tokens; the trace explains it (AC-26) while the Context tab does not.
- **A run from before this feature.** An older trace has no project-context
  data at all; AC-23/AC-25 must render the labeled empty block rather than
  failing on a missing field.
- **Zero-document repo with attachments elsewhere.** The page's empty state
  (AC-12) can coexist with agents that have attachments pointing at other
  repos, since attachment paths are repo-relative and resolved per run.

## Non-functional requirements

- **Accessibility.** The attach control is a real checkbox with an accessible
  name; reordering must be reachable without a pointer drag, since drag-only
  reordering has no keyboard equivalent, and AC-18's inert state must be
  conveyed to assistive tech, not by dimming alone; the Preview/Edit toggle and
  the collapsible trace blocks expose their expanded state.
- **Performance.** The token total on both Context tabs updates on toggle
  without re-fetching every document's content; the Project Context page does
  not re-request the list on every keystroke in Edit mode.
- **Honesty of numbers.** Every token figure is presented as approximate, and
  an `estimated` figure (AC-16) is visibly weaker than a tokenizer-derived one
  — the UI must not render a heuristic guess in the same styling as an exact
  count.
- **Observability (user-facing).** The trace block's permanent presence
  (AC-23) is itself the diagnostic: "project context was empty for this run"
  must be readable from the panel, never inferred from absence.

## Inputs and provenance

- [reused: server Project Context endpoints] Document list, source-folder
  tags, sizes, token counts and their `estimated` flag, coverage, used-by
  counts, locally-modified markers, and the refused-advance blocking paths —
  see `server/specs/project-context.md`.
- [reused: existing run trace] `prompt_assembly.specs` and `specs_read`, read
  through the client's existing trace hook and rendered by the existing
  `RunTraceDrawer`/`TraceBody` surface rather than a new panel.
- [deterministic: client-side] Filename filtering (AC-17) and the attached-set
  ordering shown in the table.
- [new: 0 LLM calls] No surface in this spec calls a model.

## Untrusted inputs

- Document content is repo text and is rendered as markdown in Preview (AC-2)
  and in row previews (AC-19). It must be rendered as content, never as live
  HTML/script, and never used to build a URL, a redirect, or a component
  choice.
- Document filenames and paths are untrusted display strings: they are
  rendered as text (with AC-27's wrapping) and never interpolated into markup.
  This includes the blocking paths echoed back in AC-9's refusal message.
- The trace block's `(untrusted)` label is literal, permanent UI copy — it
  tells the reader that the text they are about to expand was injected as data
  and mirrors `reviewer-core`'s `wrapUntrusted` convention.

## Module interactions / API contracts

- **client → server.** All data comes from the Project Context endpoints and
  the attached-set replacement endpoints described in
  `server/specs/project-context.md`'s *Module interactions* section. The
  attach/reorder call sends the whole ordered set, matching the existing
  `POST /agents/:id/skills` shape the Skills tab already uses.
- **Shared contract.** `specs_read`'s entry type gains a per-document outcome
  and reason. Per `client/INSIGHTS.md` and `server/INSIGHTS.md`,
  `client/src/vendor/shared/contracts/trace.ts` and
  `server/src/vendor/shared/contracts/trace.ts` are hand-maintained
  byte-identical duplicates with no sync script — the same edit must be applied
  to both and then diffed to confirm they still match.
- **Existing surfaces extended, not replaced.** The Prompt assembly block is
  added to the existing trace rendering path (`RunTraceDrawer` →
  `TraceBody`), and the Context tabs are added alongside the existing Agent
  and Skill editor tabs; no new route is introduced for them. The Project
  Context page itself is a new repo-scoped route.

## Open questions

None — both clarifications from the initial draft are resolved in the
acceptance criteria above (see the changelog).
