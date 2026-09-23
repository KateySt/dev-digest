# feat(reviews): Smart Diff — group Files-changed by role (core → tests → wiring → docs → boilerplate)

## Summary

Adds "Smart Diff" to the PR's Files-changed tab: files are grouped by role
(core → tests → wiring → docs → boilerplate, in that fixed order), with docs
and boilerplate collapsed by default so reviewers land on the code that
matters. "Smart order" is the default view; an "Original order" toggle
restores the flat GitHub file order. After a review has run, each group
header shows a count of files that have findings (not total findings), file
cards with findings get a dot indicator, and findings render inline under
their code line — reusing the existing `FindingCard` component (severity
bar + label, title, rationale, Accept/Dismiss) instead of a new one. A
finding whose line isn't present in the diff patch renders in a separate
"not shown inline" block at the end of its file rather than being silently
dropped. A single shared toggle hides/shows GitHub review comments and
inline findings together. Grouping is pure path-pattern classification — no
new LLM call — so it works even before any review has run.

## Changes

**Server** — new `server/src/modules/smart-diff/` module (routes + service +
helpers + constants, no `repository.ts` — reads through the existing
`ReviewRepository`; no `prompts.ts` — no LLM call):
- `routes.ts` — `GET /pulls/:id/smart-diff`, contract-validated response
  (`SmartDiffResponse`), computed fresh per request (cheap, nothing to cache).
- `service.ts` — `SmartDiffService.getForPull()`; joins `pr_files` with
  findings across *all* reviews for the PR (not just the latest run) to
  produce group + finding-line data, plus `split_suggestion` (too-big-PR
  flag, line-count threshold).
- `constants.ts` — `ROLE_ORDER` and the ordered, first-match-wins
  `CLASSIFICATION_RULES` regex table (no glob library in `server/`, so rules
  are hand-written `RegExp`s). Precedence is documented inline: boilerplate
  before tests (`__snapshots__/**`), tests before docs (`e2e/**` claims its
  own README), wiring before docs (`.claude/**`, `.github/**` claim their own
  `*.md`), `core` is the fallback.
- `helpers.ts` — pure `classifyFile()`, `buildGroups()`,
  `buildFindingLinesByPath()`. No I/O, unit-tested directly.
- Registered in `server/src/modules/index.ts`.

**Shared contracts** — `SmartDiffRole` widened from
`['core', 'wiring', 'boilerplate']` to
`['core', 'tests', 'wiring', 'docs', 'boilerplate']` in both vendored
`brief.ts` copies (`server/src/vendor/shared/contracts/brief.ts` and
`client/src/vendor/shared/contracts/brief.ts`) — a documented
hand-mirrored-edit exception to the normal do-not-touch rule for `vendor/`.

**Client** — changes concentrated in `client/src/components/diff-viewer/`
(shared) plus the feature-local `DiffTab`:
- `FileGroup/FileGroup.tsx` (new) — one collapsible role-group: header
  (label, file count, files-with-findings count), its `FileCard`s, renders
  nothing for an empty group.
- `findings.ts` (new) — `findingsForPath`, `keyForFinding`,
  `partitionFindings`; mirrors the existing `comments.ts` shape/partition
  pattern, anchoring findings on `start_line` (RIGHT side only).
- `constants.ts` — `ROLE_ORDER`, `ROLE_LABEL_KEYS`, `DEFAULT_COLLAPSED_ROLES`
  (`docs`, `boilerplate`), `SEVERITY_LABEL_KEYS`.
- `DiffViewer/DiffViewer.tsx`, `FileCard/FileCard.tsx`, `CodeLine/CodeLine.tsx`
  — reworked for grouped rendering and inline finding cards under the
  correct line.
- `DiffTab/DiffTab.tsx` — order-mode toggle (Smart/Original, Smart default),
  wires `useSmartDiff` for grouping and the existing `usePrReviews` for all
  findings-derived UI (so findings auto-update after Run Review /
  accept-dismiss without depending on the smart-diff query), shared
  show/hide toggle, `FindingCard` supplied via render-prop.
- `lib/hooks/reviews.ts` — new `useSmartDiff(prId)` query hook
  (`["smart-diff", prId]`).
- **Bug fix along the way**: the show/hide-comments button used to only
  render when GitHub comments existed. It now also renders when findings
  exist, since the shared toggle needs to control both.

**Not part of this feature**: this branch's working tree also contains an
unrelated, separately-scoped `server/src/modules/intent/` module and
`OverviewTab/_components/IntentPanel/` — out of scope for this PR
description.

## Pipeline

This feature went through the repo's subagent pipeline end-to-end:

1. **planner** — wrote the Development Plan: scoped the new
   `server/src/modules/smart-diff/` module (no `repository.ts`, no
   `prompts.ts`) and the client changes in `components/diff-viewer/`
   (`FileGroup` + `findings.ts`). Flagged two decisions for sign-off before
   implementation started: widening `SmartDiffRole` in both vendored
   `brief.ts` copies (normally do-not-touch, confirmed as a documented
   hand-mirrored-edit pattern), and making "Smart order" the default view.
   Also specified the `classifyFile()` disputed-case test table up front.
2. **implementer** — executed the plan: widened `SmartDiffRole` identically
   in both vendor copies, built the `smart-diff` server module + route,
   reworked `DiffTab`/`DiffViewer`/`FileCard`/`CodeLine` for grouped
   rendering and inline findings, wrote the classifier's own unit test table
   (31 cases, including the 3 disputed precedence cases), and fixed the
   pre-existing show/hide-comments visibility bug found along the way.
3. **architecture-reviewer** — reviewed the diff against Onion-architecture
   and component-placement rules. **Verdict: approved, zero findings.**
   Verified the classifier stays pure and server-side (not leaked into
   `reviewer-core/`), the reused `FindingCard` is wired via a render-prop so
   `diff-viewer/` (shared) never imports feature-local code, both vendored
   `brief.ts` copies stayed in sync with only the intended enum change, and
   no LLM call exists anywhere in the new module.
4. **plan-verifier** — independently re-ran every test suite and traced each
   P1/P2 acceptance criterion to file:line evidence. Found one real gap: the
   inline finding comment showed severity and title but not the
   rationale/explanation — the reused `FindingCard` defaults to collapsed,
   and the new call site wasn't passing `defaultExpanded` (unlike the
   existing Agent-runs tab, which does). Fixed with a one-line change
   (`defaultExpanded` added to the `FindingCard` usage in `DiffTab.tsx`);
   typecheck re-verified clean afterward. All P1 criteria now MET; all 7
   targeted P2 criteria were already MET on first pass.
5. **test-writer** — added client RTL coverage that didn't exist before
   (`DiffTab.tsx` had zero tests pre-feature): `DiffTab.test.tsx` (9 tests —
   group order, collapse defaults, findings counters, dot indicator, inline
   rationale rendering, unanchored-findings block, order toggle, shared
   show/hide toggle visibility) and `findings.test.ts` (8 unit tests for the
   pure `findingsForPath`/`keyForFinding`/`partitionFindings` helpers). Full
   client suite: 124/124 passing (29 files).

## Test plan

- [x] Server unit tests (`pnpm exec vitest run --exclude '**/*.it.test.ts'`):
      192/200 pass. The 8 failures are pre-existing and unrelated (verified
      independently by plan-verifier): an indexer-pipeline Windows temp-dir
      issue, a skills-helpers DTO mismatch, and a RunTrace contract fixture
      gap — all present at HEAD before this branch, in files this feature
      never touches.
- [x] Server typecheck: clean.
- [x] Client tests: 124/124 pass (29 files), including 17 new tests added
      for this feature.
- [x] Client typecheck: clean.
- [x] New `server/test/smart-diff-helpers.test.ts`: 31/31 — the
      `classifyFile()` path→role table, including the 3 disputed precedence
      cases: a `.snap` file inside `__tests__` classifies as boilerplate
      (not tests); `.claude/skills/**/*.md` classifies as wiring (not docs);
      `e2e/README.md` classifies as tests (not docs). Each is a deliberate
      first-match-wins rule ordering, documented in the test file.

### Acceptance criteria

- **P1 (blocking) — all met**: 5 ordered groups with labels/counts, lock
  files classified boilerplate, docs/boilerplate collapsed by default,
  files-with-findings counter on group headers, dot indicator on file
  cards, inline finding comment with severity/title/rationale under the
  correct line, Original-order toggle restores flat GitHub order with Smart
  order as default.
- **P2 (7 items) — all met**: constants file + disputed-case test table,
  contract-validated route response, no LLM call (grouping works before any
  review has run), colored severity bar with blocker/warning/suggestion
  labels, working Accept/Dismiss, unanchored-findings block, shared
  show/hide toggle.
- **P3 — intentionally skipped or came free, not actively pursued**:
  `FindingCard`'s existing collapse-to-one-line behavior came free (reused
  as-is); findings auto-updating after Run Review comes free via the
  existing `usePrReviews` cache invalidation (`useSmartDiff` was
  deliberately kept out of that invalidation path — see `hooks/reviews.ts`
  doc comment). Sticky group headers were explicitly deferred.

### Still needed (outside what any agent here can do)

- [ ] Demo video.
- [ ] Manual verification in a real forked DevDigest PR.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
