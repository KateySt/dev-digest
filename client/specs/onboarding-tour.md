# Spec: Onboarding Tour — repo-scoped page, five section cards, generation and degraded states

Spec ID: SPEC-06
Status: draft
Supersedes: none

Server-side counterpart (deterministic fact collection, the single LLM call,
caching, and degradation):
[`../../server/specs/onboarding-tour.md`](../../server/specs/onboarding-tour.md).
All data below assumes that spec's acceptance criteria as the source; this
spec does not restate them.

## Changelog

- 2026-09-30 — initial version

## Problem and user

An engineer new to a repository has no orientation surface in DevDigest. The
product already knows which files the repo's import graph makes foundational
and which commands its `package.json` and compose file declare, but there is
nowhere to read any of it.

The scaffolding for the screen is half-present and inconsistent. A sidebar
nav item already exists — `{ key: "onboarding-tour", label: "Onboarding
Tour", icon: "Target", href: "/onboarding", gKey: "o" }` in
`vendor/ui/nav.ts`, in the WORKSPACE section between Pull Requests and
Project Context, with a `g o` shortcut already registered in `SHORTCUTS`.
But its `href` points at `/onboarding`, which is **already occupied by an
unrelated screen**: `app/onboarding/page.tsx` renders `AddRepoView`, the
add-a-repository flow. That route is onboarding a *repo into DevDigest*; this
feature is onboarding a *person into a repo*. The nav entry therefore
currently leads to the wrong screen, and the tour has no route at all.

## Goals / Non-goals

**Goals**

- A repo-scoped **Onboarding Tour** page at `/repos/:repoId/onboarding`,
  alongside the existing `/repos/:repoId/pulls` and `/repos/:repoId/context`.
- Five collapsible section cards in a fixed order — Architecture overview,
  Critical paths, How to run locally, Guided reading path, First tasks — with
  an in-page anchor nav mirroring that order.
- An honest header: which repo, how much of it the index actually covers, and
  when the tour was last generated.
- Explicit, user-initiated generation and regeneration, with the existing
  tour staying readable throughout.
- A degraded presentation that still renders every deterministic fact and
  names which stage failed.

**Non-goals**

- **No editing of the tour.** It is a generated, read-only artifact; there is
  no edit mode, no save, and no per-section override. This is the deliberate
  contrast with the Project Context page, which is editable.
- **No progress tracking** — the reading path and first tasks are not
  checklists; nothing persists a "done" state.
- **No auto-refresh, polling-for-staleness, or background regeneration
  indicator.** Regeneration is a user action.
- **No tour history UI** — no "previous version", no diff between
  generations.
- **No Share link.** The mockup's Share-link button is cut from v1 and is not
  built in any form, including as a plain copy-the-URL affordance. This
  product's only auth provider is `LocalNoAuthProvider`, so a share link would
  imply a permissions model that does not exist, over a surface that exposes
  repo structure.
- **No new nav grouping.** The tour reuses the existing WORKSPACE section and
  the already-registered `g o` shortcut.

## User stories

- As an engineer handed an unfamiliar repo, I open the tour and learn which
  five to eight files to read first and why, without asking a teammate.
- As that engineer, I copy the run-locally commands one at a time and get the
  app running without opening `package.json` or `docker-compose.yml` myself.

## Acceptance criteria (EARS)

**Route and navigation**

- AC-1: WHEN a user activates the Onboarding Tour nav item or presses its
  `g o` shortcut, the app shall navigate to the active repo's
  `/repos/:repoId/onboarding` route and shall not navigate to the
  add-a-repository screen. (verify via: unit test)
- AC-2: WHERE the Onboarding Tour nav item is rendered, it shall remain in the
  existing WORKSPACE section, positioned after Pull Requests and before
  Project Context. (verify via: unit test)
- AC-3: WHEN the Onboarding Tour page is displayed, its breadcrumb shall show
  the repo's owner and name followed by the page name, and its header shall
  name the repo. (verify via: unit test)

**Header and index honesty**

- AC-4: WHEN a generated tour is displayed, the subtitle shall state how many
  files the index covers, out of how many were discovered, together with how
  long ago the tour was generated. (verify via: unit test)
- AC-5: WHERE the indexed file count is lower than the discovered file count,
  the subtitle shall carry a partial-index marker rather than presenting the
  indexed count as full coverage. (verify via: unit test)

**Page structure**

- AC-6: WHEN a generated tour is displayed, it shall render exactly five
  sections in this order: Architecture overview, Critical paths, How to run
  locally, Guided reading path, First tasks. (verify via: unit test)
- AC-7: WHEN the page is displayed, an in-page navigation list shall offer an
  anchor link to each of the five sections in the same order as AC-6. (verify
  via: unit test)
- AC-8: WHEN a section card is displayed, it shall render an icon, its
  heading, and a collapse control, shall start expanded, and shall expose its
  expanded state to assistive technology. (verify via: unit test)

**Section content**

- AC-9: WHEN the Architecture overview section is displayed for a healthy
  tour, it shall render the generated prose as markdown, with inline
  file-path code spans, followed by the generated architecture diagram.
  (verify via: unit test)
- AC-10: IF the generated diagram source fails to parse or render, THEN the
  section shall render the deterministic node-and-edge list supplied by the
  server as text, and shall not render an empty space or an error in place of
  the section. (verify via: unit test)
- AC-11: WHEN the Critical paths section is displayed, each entry shall show
  a repo-relative path in monospace alongside a one-line reason it is
  critical, plus an action that opens that file. (verify via: unit test)
- AC-12: WHEN a user activates a file-open action, it shall open that file at
  the repo's remote in a new tab, built through the app's existing
  deep-linking helper rather than a hand-assembled URL. (verify via: unit
  test)
- AC-13: WHEN the How to run locally section is displayed, each command shall
  be rendered as a numbered monospace row with its own copy action. (verify
  via: unit test)
- AC-14: WHEN a user activates a command's copy action, the clipboard shall
  receive exactly that command's text. (verify via: unit test)
- AC-15: WHERE the server derived no run commands, the How to run locally
  section shall render an explicit empty state explaining that none were
  found, rather than a blank card or an invented command. (verify via: unit
  test)
- AC-16: WHEN the Guided reading path section is displayed, each entry shall
  show its position in the order, its repo-relative path in monospace, and a
  one-line rationale. (verify via: unit test)
- AC-17: WHEN the First tasks section is displayed, it shall render the
  generated starter-area suggestions. (verify via: unit test)
- AC-18: WHERE any section's content is empty for a generated tour, that
  section shall render an explicit empty state rather than being hidden from
  the page or from the AC-7 anchor list. (verify via: unit test)

**Generation and regeneration**

- AC-19: WHERE a repo has no stored tour, the page shall render an empty
  state offering an explicit "Generate tour" action, and shall not request
  generation on its own. (verify via: unit test)
- AC-20: WHEN a user activates generate or regenerate, the page shall request
  generation and then reflect the job's progress until a new tour is
  available. (verify via: unit test)
- AC-21: WHILE a generation is in flight for a repo that already has a tour,
  the page shall keep the existing tour fully visible and interactive, and
  shall indicate progress on the triggering control only — never by replacing
  the page content with placeholders. (verify via: unit test)
- AC-22: WHILE a generation is in flight, the regenerate control shall be
  disabled so a second generation cannot be requested. (verify via: unit test)
- AC-23: WHEN a generation completes, the page shall display the new tour and
  an updated last-generated time without requiring a manual reload. (verify
  via: unit test)
- AC-24: IF a generation request fails, THEN the page shall surface the
  failure and leave the previously displayed tour intact. (verify via: unit
  test)

**Degraded states**

- AC-25: WHERE a repo has no clone, the page shall render an empty state
  naming the missing clone as the reason, with the generate action
  unavailable, and shall not render an error. (verify via: unit test)
- AC-26: WHERE the displayed tour is degraded, the page shall render a banner
  that distinguishes a degraded index from a failed generation, each stating
  its own remedy. (verify via: unit test)
- AC-27: WHERE a tour is degraded because generation failed, the page shall
  still render every deterministic fact it carries — reading path, critical
  paths, and run commands — with the prose omitted rather than the sections
  blank. (verify via: unit test)

**Cross-cutting UI rules**

- AC-28: WHEN any repo-relative path is rendered in a section row, a heading,
  or a diagram fallback, its text shall wrap inside its own box rather than
  overflow its container. (verify via: manual check)
- AC-29: WHEN any generated text is rendered, it shall be rendered as
  markdown content and never as live HTML, and shall never be used to build a
  URL or select a component. (verify via: unit test)
- AC-30: WHEN any user-facing string on this page is rendered, it shall come
  from a `next-intl` message key rather than a literal in the component.
  (verify via: unit test)

## Edge cases

- **Long, unbroken file paths.** A path like
  `src/modules/repo-intel/pipeline/incremental.ts` has no spaces, so the
  browser treats it as one unbreakable word. `client/INSIGHTS.md` records this
  exact bug class being caught three times in one session: neither `Badge`'s
  hardcoded `white-space: nowrap`, nor a flex child's default
  `min-width: auto`, nor `text-overflow: ellipsis` alone creates a wrap
  opportunity, and a bare `1fr` grid track expands to the content's
  max-content width before any child-level fix applies. AC-28 exists because
  of that entry; the per-call-site fix is `overflowWrap: "anywhere"` +
  `wordBreak: "break-word"` + `minWidth: 0`, and any containing grid track
  needs `minmax(0, 1fr)`. This page is path-dense — three of its five sections
  are lists of paths — so this is the single most likely visual regression
  here.
- **The nav item currently points at the wrong screen.** Until AC-1 lands,
  `g o` and the sidebar item both open `AddRepoView`. Fixing it means editing
  `vendor/ui/nav.ts`, which root `AGENTS.md` marks do-not-touch. Both
  `INSIGHTS.md` files establish that the `vendor/ui` and `vendor/shared` trees
  are hand-maintained with no upstream owning package and no sync script, so
  the edit is safe when made deliberately — and `client/INSIGHTS.md` warns
  separately that editing a `vendor/ui` barrel or shared file with a narrow
  `old_string` has silently dropped unrelated content before, so the result
  should be diffed immediately.
- **The nav href has no repo in it.** The existing entry's `href` is not
  `:repoId`-templated. `resolveHref()` substitutes `_` when no repo is active,
  so the repo-scoped route needs the same `:repoId` token the Pull Requests
  and Project Context entries already use, and the no-active-repo case must
  land somewhere coherent rather than on `/repos/_/onboarding`.
- **A tour generated before the last re-index.** Nothing invalidates a stored
  tour when the index advances. Per the no-auto-refresh non-goal, AC-4's
  last-generated time is the only staleness signal the page offers, and
  correcting a stale tour is an explicit regeneration.
- **A generated path that no longer exists.** The server constrains prose to
  paths drawn from the index (server AC-19), but the index can still lag a
  deletion. AC-12's open action is a remote deep link, so a stale path
  produces a remote 404 rather than a broken in-app state.
- **A degraded tour with an empty reading path.** A repo consisting only of
  tests and configs has every candidate filtered out server-side, so a
  degraded banner (AC-26) and an empty section (AC-18) can appear together;
  both must render, not one suppressing the other.
- **An invalid diagram in an otherwise healthy tour.** AC-10's fallback is
  independent of AC-26's degraded banner — a tour can be fully healthy and
  still have an unrenderable diagram, so the fallback must not imply the whole
  tour degraded.
- **Regenerating a degraded tour.** AC-21 keeps the existing tour visible
  during regeneration, including when that existing tour is a degraded
  skeleton — so a degraded banner stays on screen while the retry runs, which
  must not read as the retry having already failed.
- **A very long tour.** The anchor nav (AC-7) is the mitigation for a page
  whose five sections can be long; anchors must resolve to sections that are
  collapsed as well as expanded, since AC-8's collapse control lets a user
  collapse a section the nav still links to.

## Non-functional requirements

- **Accessibility.** Each collapsible section exposes its expanded state
  (AC-8); every copy and open action has an accessible name naming its target
  rather than a bare "Copy"; the in-page anchor nav is reachable and operable
  by keyboard; and the architecture diagram needs a text equivalent, which
  AC-10's deterministic node-and-edge list already provides as a non-visual
  representation of the same content.
- **No surprise cost.** Merely opening the page never triggers an LLM call
  (AC-19) — generation is always an explicit user action. This matters
  because this product surfaces cost everywhere else (per-PR `cost_usd`, a
  price book, per-feature model settings), so a navigation-triggered spend
  would be out of character.
- **Non-blocking regeneration.** AC-21's rule exists because generation runs
  as a background job with up to a 120-second budget; blanking the page for
  that long would read as a hang, and the previous tour stays valid until the
  new one lands.
- **Honesty over polish.** The page must never present a partial index as
  complete (AC-5), never hide a failed generation behind a normal-looking
  tour (AC-26), and never fill a section it has no data for (AC-15, AC-18).
  This mirrors the "honesty of numbers" requirement in
  `client/specs/project-context.md`, where an estimated figure may not be
  styled as an exact one.
- **Rendering safety.** Every string in a section body is either
  repo-derived or model-authored, and both are untrusted — AC-29 keeps them
  as rendered content, never markup, never a URL source.

## Inputs and provenance

- [reused: server Onboarding Tour endpoints] The whole tour body — prose,
  diagram source and its fallback node/edge list, critical paths, run
  commands, reading path, first tasks — plus the generated-at timestamp, both
  index counts, and the degraded status and reason. See
  `server/specs/onboarding-tour.md`.
- [reused: existing job-progress convention] Generation returns an accepted
  response with a job id, and progress is observed by re-reading, matching
  the existing `POST /repos/:id/resync` pattern the client already follows.
- [reused: existing client primitives] Markdown rendering via the existing
  `Markdown` primitive (`react-markdown` + `remark-gfm`), diagram rendering
  via the existing `components/mermaid-diagram/MermaidDiagram` component, and
  remote file deep-links via `lib/github-urls.ts`'s existing blob-URL helper
  (AC-12).
- [deterministic: client-side] Section collapse state, anchor-nav scrolling,
  and the relative formatting of the generated-at timestamp.
- [new: 0 LLM calls] No surface in this spec calls a model. The only LLM call
  in this feature happens server-side, inside the generation job.

## Untrusted inputs

- **Generated prose and rationales are untrusted model output.** They are
  rendered as markdown content (AC-29), never as live HTML, and never used to
  build a URL, a redirect, or a component choice.
- **The diagram source is untrusted model output** and is the highest-risk
  string on this page, because it is passed to a rendering library rather
  than displayed. It must be treated as data that can be malformed or
  hostile: a parse or render failure is an expected outcome with a defined
  fallback (AC-10), not an exception that may break the page.
- **Repo-relative paths are untrusted display strings.** They are rendered as
  text with AC-28's wrapping, never interpolated into markup, and only ever
  turned into a URL through the existing deep-link helper (AC-12), which
  encodes the path rather than concatenating it.
- **Shell commands are untrusted display text.** They are shown and copied
  verbatim (AC-14) and are never executed by the client. The copy action
  places text on the clipboard; what the user then runs is their decision,
  which is precisely why the server derives these commands from real repo
  files rather than from a model.

## Module interactions / API contracts

- **client → server.** All data comes from the Onboarding Tour read and
  generate endpoints described in `server/specs/onboarding-tour.md`'s
  *Module interactions* section. Generation is request-then-re-read, not a
  held-open request.
- **Shared contract.** The tour's response type is new to the shared
  contracts. Per both `INSIGHTS.md` files,
  `client/src/vendor/shared` and `server/src/vendor/shared` are
  hand-maintained byte-identical duplicates with no sync script — the same
  edit must be applied to both and then diffed to confirm they still match —
  and fields absent on a degraded tour must be `.nullish()` rather than
  required, since a degraded skeleton omits every prose field.
- **Existing surfaces extended, not replaced.** The page is a new
  repo-scoped route under the existing `app/repos/[repoId]/` tree, beside
  `pulls` and `context`. The nav entry and its `g o` shortcut already exist in
  `vendor/ui/nav.ts` and are repointed, not added. The markdown, Mermaid, and
  GitHub-URL helpers are all reused as-is.
- **Route collision to resolve.** `app/onboarding/` currently hosts
  `AddRepoView`. This feature does not move, rename, or repurpose that route;
  it only stops the nav item from pointing at it (AC-1). Whether the
  add-a-repository screen should eventually be renamed to reduce the
  "onboarding" ambiguity is out of this feature's scope.
- **No new dependency.** `mermaid`, `react-markdown`, and `remark-gfm` are
  already direct dependencies of `client/`, and a `MermaidDiagram` component
  already exists. Nothing is added to `package.json`.

## Design decisions

- **Regeneration is non-blocking rather than a skeleton swap.** The previous
  tour remains valid until a new one is stored, and the job can take most of
  two minutes; replacing the page with placeholders for that long would
  suggest a hang and would throw away readable content for no gain.
- **Generation is opt-in on first visit.** An empty state with an explicit
  action (AC-19) was chosen over auto-generating on first view, so that
  navigating to a page can never initiate an LLM spend.
- **The diagram fallback is a text list, not a hidden section.** A model can
  emit invalid Mermaid, and a silently missing diagram would make a healthy
  tour look broken. Rendering the deterministic node-and-edge list instead
  doubles as the diagram's text equivalent for assistive technology.
- **Share link cut rather than downgraded.** Shipping it as a plain
  copy-the-URL button was considered and rejected: the affordance reads as a
  sharing-and-permissions capability, and this product has no authentication
  at all to back that reading.

## Open questions

None — every clarification raised during the spec dialog was resolved before
this spec was written. The three decisions the dialog was required to close
are recorded above and in the server spec: the product definition and its
non-goals (*Goals / Non-goals*), the large-repo strategy (AC-4, AC-5, AC-26),
and the no-clone and degraded behavior (AC-25 through AC-27).
