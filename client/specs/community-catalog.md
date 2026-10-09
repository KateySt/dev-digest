# Spec: Community catalog — folder browser, tag chips, Settings Catalog section, per-project suggestions

Spec ID: SPEC-07
Status: draft
Supersedes: none

Server-side counterpart (live GitHub catalog, layout contract, tag slugs,
`repo_id` project scoping, language-matched suggestions, caching and
degradation):
[`../../server/specs/community-catalog.md`](../../server/specs/community-catalog.md).
Its acceptance criteria are referenced below as `S-AC-N` and are assumed as
given — this spec never restates or re-litigates them. The server spec in turn
extends [`../../server/specs/skills.md`](../../server/specs/skills.md)
(SPEC-01), whose attachment/ordering, `enabled` trust gate and versioning
behavior are unchanged by this feature and are not re-specified here either.

## Changelog

- 2026-10-07 — Recorded the already-shipped (075b562) client side of the
  server's 2026-10-02 filtering/reassignment amendment (S-AC-35 – S-AC-48),
  which this spec had not covered: the Skills page's project-scope switcher
  and the Skill editor Config tab's project picker, as C-AC-53 – C-AC-58.
  Narrowed the contradicting non-goal "No filtering of the Skills page by tag
  or project" to tag filtering only (project filtering now exists). Noted the
  server's 2026-10-07 robustness changes (S-AC-52/S-AC-53 fallback entries,
  S-AC-50 422 on a malformed `repo_id`) under Edge cases; no new client
  behavior is required for them.
- 2026-10-02 — initial version

## Problem and user

The server replaces the four-entry fixture catalog with a live GitHub catalog
(S-AC-5 – S-AC-16), swaps the single `lang` string for a set of tag slugs, and
makes `repo_id` mandatory on community import (S-AC-20). The current Community
tab cannot express any of that: it renders a flat search list of
`name · stars · repo · desc`
(`AddSkillDrawer.tsx`'s `CommunityImportTab`), derives language pills from a
second unfiltered fetch, imports by `name`, has no project concept, and shows
one generic "no match" box for every failure mode including a misconfigured
catalog. Three gaps follow:

- A catalog organized into folders by language/topic has no browsable surface —
  the user can only guess search terms, exactly the complaint SPEC-01's fixture
  design already had.
- Nothing proactively connects a project to the skills that apply to it, even
  though the server now computes that match (S-AC-26 – S-AC-30).
- The catalog location is configurable server-side but has no UI, so a typo in
  it is indistinguishable from an empty catalog — the failure mode the server
  spec calls out as "every failure of this feature looks identical from the UI".

The user is the engineer importing skills (needs to browse, and to land the
skill in the right project) and the catalog author/operator (needs to point
DevDigest at their repository and confirm it resolves).

## Goals / Non-goals

**Goals**

- Rebuild the Add Skill drawer's **Community tab** as a collapsed folder
  accordion over the single catalog payload, with colored tag chips, a flat
  cross-folder search/filter mode, and a **required, always-visible project
  picker**.
- Render **three visibly distinct** non-result states — catalog unavailable,
  catalog reachable but empty, and filter matched nothing — so a configuration
  error can never read as an empty catalog.
- Add a **Catalog** section to Settings holding the catalog repository as a
  plain visible, editable value with a **Test** action.
- Surface **per-project suggestions** in two places: a card on the repo
  onboarding page (the proactive surface) and a pinned group at the top of the
  Community tab (the in-context one).
- Show each skill's **tags** and **project scope** on the Skills page so the
  post-import pile is no longer undifferentiated.

**Non-goals**

- **No filtering of the Skills page by tag.** Tags and the scope badge are
  display-only. *(2026-10-07: narrowed from "by tag or project" — project
  filtering shipped with the server's 2026-10-02 amendment and is specified in
  C-AC-53 – C-AC-56; tag filtering stays deferred, matching the server spec.)*
- **No dismiss/hide/snooze for a suggestion.** A suggestion leaves the list
  only by being imported (S-AC-28) or by the repo's language breakdown
  changing. Nothing new is persisted client- or server-side for this.
- **No project picker on the From file / From URL tabs.** Those paths stay
  global at creation (`repo_id` absent, S-AC-23). *(2026-10-07)* Scope can
  be changed afterwards from the Skill editor's Config tab (C-AC-57,
  C-AC-58).
- **No client-side catalog caching, mirroring, or pagination.** The listing is
  one server-cached payload (S-AC-5/S-AC-6); the client holds no copy beyond
  its query cache.
- **No star counts, popularity, or social-proof metadata** anywhere — the
  contract no longer carries them.
- **No catalog-authoring UI** — no creating, editing, or publishing catalog
  entries from DevDigest.
- **Not a Settings-page redesign.** One section is added; API Keys and Feature
  Models are untouched.

## User stories

- As an engineer on a Python project, I open the Add Skill drawer and see
  Python skills suggested at the top before I have typed anything, then browse
  `go/` and `testing/` folders for the rest.
- As an engineer importing a skill, I can see — before I click Import — which
  project it will land in, and change it.
- As the catalog operator, I paste my repository into Settings → Catalog, press
  Test, and get back "12 folders, 48 skills" or the reason it failed.
- As an engineer looking at the Skills page afterwards, I can tell which skills
  belong to which project and what each one is tagged with.

## Acceptance criteria (EARS)

### Community tab — folder browser

- AC-1: WHEN the Community tab is opened, the system shall render one
  collapsible row per catalog folder showing the folder's name and its entry
  count, with every folder collapsed. (verify via: unit test)
- AC-2: WHEN a folder row is expanded, the system shall list that folder's
  entries from the already-loaded listing payload and shall issue no additional
  catalog request. (verify via: unit test)
- AC-3: WHERE a folder row is rendered, the system shall make it operable by
  keyboard and shall expose its expanded/collapsed state to assistive
  technology. (verify via: unit test)
- AC-4: WHEN the drawer is closed and reopened, the system shall render every
  folder collapsed, retaining no expansion state from the previous session.
  (verify via: unit test)
- AC-5: WHILE the search field is non-empty, the system shall replace the
  accordion with a flat list of matching entries drawn from all folders, each
  row labeled with its folder name. (verify via: unit test)
- AC-6: WHEN the search field is cleared, the system shall restore the
  accordion with every folder collapsed. (verify via: unit test)
- AC-7: WHEN a tag chip on a catalog entry is activated, the system shall apply
  that tag slug as the active catalog filter and present the result as the same
  flat cross-folder list as AC-5. (verify via: unit test)
- AC-8: WHILE a tag filter is active, the system shall display the active slug
  together with a control that clears it. (verify via: unit test)
- AC-9: WHEN the active tag filter is cleared, the system shall restore the
  accordion with every folder collapsed. (verify via: unit test)
- AC-10: WHILE the catalog listing request is in flight, the system shall
  render a loading placeholder and shall render neither the empty-catalog state
  nor the unavailable state. (verify via: unit test)
- AC-11: WHERE a catalog entry's repo-relative path is displayed, the system
  shall give that text a wrap opportunity so it cannot overflow its container.
  (verify via: manual check)

### Tag chips

- AC-12: WHEN a tag slug is rendered as a chip, the system shall derive the
  chip's color deterministically from the slug, so the same slug renders the
  same color in every surface and across sessions. (verify via: unit test)
- AC-13: WHERE a tag chip is rendered, the system shall render the slug as
  text within the chip and shall not convey the tag's identity by color alone.
  (verify via: unit test)
- AC-14: WHERE the tag palette is defined, every entry shall provide a contrast
  ratio of at least 4.5:1 between chip text and chip background in both the
  light and the dark theme. (verify via: unit test)
- AC-15: WHERE the tag palette is defined, it shall exclude the colors used by
  the severity and status badges, so a tag chip cannot be misread as a severity
  badge. (verify via: unit test)
- AC-16: IF two different tag slugs map to the same palette entry, THEN the
  system shall render both with that color and shall not reassign either to
  keep colors unique. (verify via: unit test)

### Community tab — project picker and import

- AC-17: WHEN the Community tab is opened, the system shall render a project
  picker pre-selected to the currently active repo. (verify via: unit test)
- AC-18: WHILE the Community tab is open, the system shall keep the project
  picker visible and changeable, including when its value was pre-filled.
  (verify via: unit test)
- AC-19: WHEN an entry is imported, the system shall send that entry's
  repo-relative path together with the picked project's id. (verify via: unit
  test)
- AC-20: IF no project is connected, THEN the system shall render the catalog
  browser in a browse-only state — every Import action disabled, with an inline
  message linking to the add-a-repository flow as the explanation. (verify via:
  unit test)
- AC-21: WHEN an import succeeds, the system shall report success naming both
  the imported skill and the project it was imported into. (verify via: unit
  test)
- AC-22: WHEN an import succeeds, the system shall keep the drawer open so
  further entries can be imported. (verify via: unit test)
- AC-23: WHILE an import is in flight, the system shall disable only the Import
  action of the entry being imported. (verify via: unit test)
- AC-24: WHEN an entry already imported into the picked project is imported
  again, the system shall perform the import and shall not block or hide that
  entry's Import action. (verify via: unit test)

### Unavailable, empty, and no-match states

- AC-25: IF the listing reports the catalog as unavailable, THEN the system
  shall render an error state carrying the server's failure message plus a link
  to the Settings Catalog section, and shall not render the empty-catalog
  state. (verify via: unit test)
- AC-26: IF the catalog is reachable and yields zero entries, THEN the system
  shall render an empty-catalog state that states the catalog was reached
  successfully, distinct in copy and icon from AC-25's state. (verify via: unit
  test)
- AC-27: IF a search or tag filter yields no entries WHILE the catalog itself
  is non-empty, THEN the system shall render a no-match state distinct from both
  AC-25 and AC-26, offering to clear the filter. (verify via: unit test)
- AC-28: WHEN the unavailable state is rendered, the system shall offer a retry
  action that re-requests the listing. (verify via: unit test)

### Settings — Catalog section

- AC-29: WHEN the Settings navigation is rendered, the system shall include a
  Catalog section alongside the existing API Keys and Feature Models sections.
  (verify via: unit test)
- AC-30: WHEN the Catalog section is opened, the system shall render the
  configured catalog repository as a plain visible, editable text value, never
  masked and with no reveal control. (verify via: unit test)
- AC-31: WHERE no workspace override is stored, the system shall present the
  effective environment default in a form distinguishable from a stored value.
  (verify via: unit test)
- AC-32: WHEN an edited catalog value is saved, the system shall persist it
  through the existing settings update path and shall reflect the persisted
  value after a reload. (verify via: integration test)
- AC-33: WHEN the Test action is activated, the system shall render the
  returned outcome's message verbatim together with a success or failure
  indicator. (verify via: unit test)
- AC-34: WHEN the Test action is activated while the field holds an unsaved
  edit, the system shall test that edited value without persisting it. (verify
  via: integration test)
- AC-35: IF the test request fails without returning an outcome, THEN the
  system shall render a client-side fallback failure message. (verify via: unit
  test)
- AC-36: WHILE a test is in flight, the system shall disable the Test action
  and indicate that it is running. (verify via: unit test)

### Per-project suggestions — repo onboarding card

- AC-37: WHEN the repo onboarding page is rendered, the system shall include a
  skill-suggestions card listing that repo's suggested catalog entries with
  their tag chips. (verify via: unit test)
- AC-38: IF a repo has no suggestions, THEN the system shall omit the
  suggestions card entirely rather than render an empty one. (verify via: unit
  test)
- AC-39: WHEN a suggested entry is imported from that card, the system shall
  import it into that page's repo without prompting for a project. (verify via:
  unit test)
- AC-40: WHEN an import from the suggestions card succeeds, the system shall
  remove that entry from the displayed suggestions. (verify via: unit test)
- AC-41: IF the suggestions response carries the unavailable indicator, THEN
  the system shall render AC-25's unavailable message and Settings link in
  place of the list, rather than omitting the card as in AC-38. (verify via:
  unit test)

### Per-project suggestions — pinned group in the Community tab

- AC-42: WHEN the Community tab is opened and the picked project has
  suggestions, the system shall render a pinned "Suggested for `<project>`"
  group above the folder accordion, expanded. (verify via: unit test)
- AC-43: WHERE the pinned group is rendered, the system shall present it as
  visually distinct from a folder row and shall exclude it from the accordion's
  collapse behavior. (verify via: unit test)
- AC-44: IF the picked project has no suggestions, THEN the system shall omit
  the pinned group entirely. (verify via: unit test)
- AC-45: WHEN the picked project changes, the system shall request suggestions
  for the newly picked project and update the pinned group. (verify via: unit
  test)
- AC-46: WHILE a search or tag filter is active, the system shall omit the
  pinned group from the flattened result list. (verify via: unit test)

### Skills page — tags and project scope

- AC-47: WHERE a skill carries one or more tags, the system shall render them
  as tag chips in a row below the card's existing badge row. (verify via: unit
  test)
- AC-48: WHERE a skill carries more than four tags, the system shall render the
  first four chips plus a count of the remainder. (verify via: unit test)
- AC-49: IF a skill carries no tags, THEN the system shall render neither a tag
  row nor a placeholder in its place. (verify via: unit test)
- AC-50: WHERE a skill is scoped to a project, the system shall render a badge
  naming that project in the card's badge row. (verify via: unit test)
- AC-51: WHERE a skill is global, the system shall render no scope badge.
  (verify via: unit test)
- AC-52: WHERE a tag chip or a scope badge is rendered on a skill card, the
  system shall not make it an interactive control. (verify via: unit test)

### Skills page — project scope filtering and reassignment (2026-10-07, shipped 075b562)

Client side of the server's 2026-10-02 amendment (S-AC-35 – S-AC-48).

- AC-53: WHEN the Skills page is rendered, the system shall render a
  project-scope switcher offering "All projects", "Global only", and one
  option per workspace repo. (verify via: unit test)
- AC-54: WHILE the repo list has not finished loading, the system shall not
  request the skills listing. (verify via: unit test)
- AC-55: WHEN the repo list has loaded and the user has not picked a scope,
  the system shall default the switcher to the active repo, or to "Global
  only" when there is no resolvable active repo. (verify via: unit test)
- AC-56: WHEN a scope is selected, the system shall request `GET /skills`
  with `repo_id=<repo id>` for a repo, `repo_id=none` for "Global only", and no
  `repo_id` for "All projects". (verify via: unit test)
- AC-57: WHEN the Skill editor's Config tab is rendered, the system shall show
  a project-scope picker offering "Global" and one option per workspace repo,
  pre-selected to the skill's current scope. (verify via: unit test)
- AC-58: WHEN a different scope is picked in the Config tab, the system shall
  send `PUT /skills/:id` with `repo_id` set to the picked repo id, or `null`
  for "Global"; picking the current scope shall send no request. (verify via:
  unit test)

## Edge cases

- **Two entries with the same name in different folders.** `python/naming.md`
  and `go/naming.md` both resolve to "Naming" (server edge case, identity is
  the path per S-AC-17). Every list in this spec must key and identify rows by
  path; the current code's `key={r.name}` would collapse them into one React
  key and mis-target the import.
- **Active repo points at a deleted repository.** `repo-context` resolves
  `repoId` from `localStorage` before the repos list arrives and can name a
  repo that no longer exists (`useRepoNotFound` exists for exactly this). The
  project picker must land on a real repo or on the zero-repo state of AC-20,
  never on a stale id that would fail import with S-AC-21's workspace
  rejection.
- **Repos still loading when the drawer opens.** "Repo list not resolved yet"
  and "no repos connected" are different states; the zero-repo CTA of AC-20
  must not flash while `/repos` is in flight. Same class of bug as
  `client/INSIGHTS.md` (2026-09-15) on lazily-fetched data.
- **Catalog goes unavailable between listing and import.** The browser holds a
  cached listing while the upstream breaks; the import then fails per S-AC-22
  or S-AC-31. The failure surfaces on that row, and the browser is not blanked
  into AC-25's state on an import error.
- **Very large catalog in one payload.** The listing is unpaginated by design
  (S-AC-5). All folders collapsed by default (AC-1) keeps the initial render to
  one row per folder rather than one per entry.
- **A folder with no valid entries never appears** — the server omits it from
  the listing entirely, so the client needs no empty-folder rendering.
- **Long unbroken strings.** Entry paths and long tag slugs have no spaces and
  will run past their container unless given wrap room (AC-11) — the exact
  failure documented three times in `client/INSIGHTS.md` (2026-09-24) for
  `file:line` strings. Chips additionally must not stretch a grid track; the
  same `minmax(0, 1fr)` / `minWidth: 0` discipline applies.
- **Theme toggled while chips are on screen.** A slug's color must stay the
  same color identity across the toggle (AC-12) while remaining legible in both
  themes (AC-14) — the palette is theme-aware, the slug→palette-index mapping
  is not.
- **A truncated imported body** (server AC-19 cuts at the byte cap) still
  arrives as a normal skill and shows SPEC-01's existing needs-vetting badge;
  this spec adds no truncation indicator.
- **Legacy fixture-era community skills** keep `tags = null` and
  `repo_id = null` (S-AC-34), so on the Skills page they render with no tag row
  (AC-49) and no scope badge (AC-51) — visually identical to a global manual
  skill. Accepted: the server resolved that question by leaving those rows
  untouched, and this spec adds no legacy marker.
- **A repo with no stored language breakdown** yields an empty suggestion list,
  not an error (S-AC-30), so it takes AC-38's omitted card and AC-44's omitted
  group — not AC-41's unavailable treatment.
- *(2026-10-07)* **Catalog entries with fallback metadata.** When an entry's
  body could not be read during population, the server still lists it with a
  filename-derived name, empty description, folder-only tags and type
  `custom` (S-AC-52, S-AC-53). The browser renders it like any other entry —
  no special state — and the catalog is not shown as unavailable.
- *(2026-10-07)* **Malformed `repo_id`** — the server now answers 422 for a
  non-UUID `repo_id` (S-AC-50, S-AC-51). The client only ever sends ids from
  `GET /repos` or the `none` literal, so this is a defensive server check, not
  a new client error state.
- *(2026-10-07)* **"All projects" vs "Global only".** They are different
  scopes (S-AC-36 vs S-AC-37) and must never share a value in the switcher;
  "All projects" omits the parameter entirely rather than sending a sentinel.
- **Import into a project other than the one being viewed.** The drawer's
  picker is changeable (AC-18), so a skill can be imported into a repo that is
  not the active one; AC-21's confirmation names the project precisely so that
  is visible rather than silent.

## Non-functional requirements

- **Accessibility.** Tag color is decorative reinforcement, never the carrier
  of meaning (AC-13), palette contrast is held to WCAG AA 4.5:1 in both themes
  (AC-14), and the accordion is keyboard-operable with its state exposed
  (AC-3). The three non-result states differ in copy, not only in icon or
  color (AC-25 – AC-27).
- **Request budget.** Browsing costs one listing request per drawer open
  (served from the server's cache per S-AC-6), and expanding a folder costs
  zero (AC-2). Suggestions cost one request per repo, re-requested only when
  the picked project changes (AC-45). Nothing in this spec polls.
- **No duplicate fetch to derive filters.** Tag chips and folders both come
  from the single listing payload — the current tab's second unfiltered fetch
  (used only to keep the language pills stable) is removed, not reproduced for
  tags.
- **Internationalization.** All new copy goes through the existing `next-intl`
  message catalogs (`src/i18n/en`); no literal user-facing strings in
  components, matching every other surface in `client/`.
- **No new runtime dependency.** The folder accordion, chips, picker, and
  settings panel are built from the existing `vendor/ui` primitives and the
  established inline-`style` + `var(--token)` convention.

## Inputs and provenance

- [reused: `GET /skills/community`] Catalog listing — folders, entry
  paths/names/descriptions/tags/types, plus the availability indicator. One
  payload, grouped into folders client-side (S-AC-8).
- [reused: `GET /repos/:id/skill-suggestions`] Per-repo suggested entries plus
  the availability indicator — already language-matched, threshold-filtered and
  de-duplicated against imports server-side (S-AC-26 – S-AC-30). The client
  performs no matching of its own and never reads `repos.languages` for this.
- [reused: `GET`/`PUT /settings`] The `community_catalog_repo` value and the
  environment default behind it.
- [reused: catalog test endpoint] The `{ ok, message }` outcome rendered by
  AC-33, message included.
- [reused: `GET /repos` via `repo-context`] Project list, active repo, and the
  picker's pre-selected value.
- [reused: `GET /skills`] Skill list items, now carrying `tags` and `repo_id`
  for AC-47 – AC-51; *(2026-10-07)* with the optional `repo_id` scope
  parameter for AC-56.
- [reused: `PUT /skills/:id`] Project-scope reassignment (AC-58), with the
  client's skill-update patch type widened to carry `repo_id`.
- [deterministic: client-side stable hash of the tag slug → index into a fixed
  palette] Tag chip color. The server emits no color (its explicit non-goal);
  the mapping is pure, has no stored state, and is shared by every surface that
  renders a chip.
- [new: 0 LLM calls] No surface in this spec makes or triggers an LLM call
  directly. Importing causes the server's content scan — one call per imported
  skill, accounted for in the server spec.

## Untrusted inputs

Everything the catalog contributes is third-party content from a public GitHub
repository (the server spec's reasoning applies unchanged), and it reaches the
DOM here.

- **Entry names, descriptions, folder names, tag slugs, and paths** — rendered
  as plain text only. No markdown rendering, no HTML interpretation, and no
  `dangerouslySetInnerHTML` on any catalog-derived value, including inside the
  suggestion card.
- **Tag slugs** — already slug-normalized and length-capped server-side; the
  chip additionally must not change layout based on slug length (AC-11's wrap
  discipline).
- **Entry descriptions** — display text, visually capped, never rendered as
  instructions or links.
- **The test action's message** — server-generated but may echo the user's own
  catalog value; rendered verbatim as text (AC-33), never as markup.
- **The configured catalog value typed into Settings** — validated and
  constrained server-side (S-AC-3); the client does not pre-validate it into a
  false sense of safety, and the Test action is the user-facing check.
- **An imported skill's body** — never displayed by this spec's surfaces; it
  reaches the user only through the existing Skill editor, under SPEC-01's
  scan + `enabled: false` gate.

## Module interactions / API contracts

- **client → server.** Every datum comes from the endpoints in the server
  spec's *Module interactions* section: the catalog listing, the catalog
  refresh action, `POST /skills/import-community` (now `path` + required
  `repo_id`), `GET /repos/:id/skill-suggestions`, the catalog test action, and
  `GET`/`PUT /settings`. No new endpoint is requested by this spec.
- **Shared contract edit, hand-applied.** `CommunitySkill` loses `stars`/`lang`
  and gains `path`/`folder`/`tags`/`type`; `Skill` gains nullish `repo_id` and
  `tags`. The identical edit must be applied by hand to
  `client/src/vendor/shared/contracts/knowledge.ts` — **not** assumed to arrive
  by a tree sync — and then diffed **only for that file**. Per
  `client/INSIGHTS.md` (2026-09-30) this exact file is one of five already
  drifted between the two `vendor/shared` trees (this side is missing the
  server's `AgentVersionConfig`/`AgentVersion` exports), so a whole-tree diff
  is not a usable parity check and the pre-existing drift must be left alone
  rather than "fixed" in passing.
- **Hooks.** `lib/hooks/skills.ts`'s `useCommunitySkills` changes shape (tag
  parameter replacing `lang`, availability indicator in the response) and
  `useImportCommunitySkill` changes from `name` to `{ path, repo_id }`; a
  suggestions hook and a catalog-test hook are added. Both existing hooks have
  exactly one caller today (`CommunityImportTab`).
- **Settings navigation is a vendored, additive edit.** `SETTINGS_SECTIONS` in
  `client/src/vendor/ui/nav.ts` currently holds only `api-keys` and `models`;
  a `catalog` entry is appended there and routed in `SettingsView.tsx` beside
  the existing two, following `client/INSIGHTS.md` (2026-09-15) on additive
  `vendor/ui` changes. The catalog field is deliberately **not** placed in
  `SettingsApiKeys` — that panel is secrets-only and never shows a stored
  value, and the catalog location is non-secret and must be displayable.
- **Repo context is reused, not duplicated.** The picker's default and the
  zero-repo case come from `lib/repo-context`'s existing
  URL > `localStorage` > first-repo resolution; no second source of "current
  project" is introduced.
- **The suggestion card joins an existing repo-scoped page** at
  `app/repos/[repoId]/onboarding/` (SPEC-06's Onboarding Tour) rather than
  creating a new route — there is no repo-scoped skills page, and this spec
  does not add one.
- **`Chip`'s existing `color` prop is insufficient.** `vendor/ui/primitives/Chip.tsx`
  applies `color` to the chip's icon only, not to its background, border, or
  text, so a colored tag chip needs a new additive primitive or a local
  component — reusing `Chip color=` as-is will not satisfy AC-12/AC-14.

## Design decisions

- **The Test action's message is rendered verbatim, not reformatted.** S-AC-4
  already specifies a human-readable message with folder and entry counts on
  success and the reason on failure; reformatting client-side would mean either
  parsing prose or duplicating the server's count formatting, and
  `SettingsApiKeys` already sets the precedent of rendering `res.message`
  as-is with a success/failure icon. The client contributes only the fallback
  for a request that returns no outcome at all (AC-35).
- **Tag color is a fixed palette indexed by a stable hash, not a generated
  color.** Generating a color per slug (e.g. HSL from the hash) cannot be held
  to a contrast guarantee in two themes; a hand-checked palette can (AC-14).
  Collisions are therefore accepted (AC-16) — color is a scanning aid, and the
  slug text is always the identity (AC-13).
- **Three non-result states, not two.** The server distinguishes unavailable
  from empty; the client adds a third for "your filter matched nothing", since
  collapsing that into the empty-catalog state would tell a user with a healthy
  catalog that their catalog is empty.
- **Suggestions are not auto-expanded as a folder.** The pinned group makes a
  language-based auto-expand of the matching folder redundant and would show
  the same entries twice on first open; the server's matching (5% threshold,
  already-imported exclusion) is also strictly better than a client-side guess
  at a repo's primary language.
- **The pinned group is browse-mode only** (AC-46). Filter mode is a flat
  answer to an explicit query; keeping a pinned unfiltered group above it would
  show entries that do not match what was typed.
- **Import disabling is per entry, not global** (AC-23). The current tab
  disables every Import button whenever any import is pending, which was
  tolerable for four fixture rows and is not for a browsable catalog.
- **The environment default is shown as a distinguishable hint** (AC-31) rather
  than pre-filled into the input, so saving the form never silently converts
  the env default into a stored workspace override.

## Open questions

None. Every item raised during the dialog was resolved; the server spec
(SPEC-07) carries no open clarifications either.
