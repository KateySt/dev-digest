# Spec: Community skill catalog — live GitHub source, tags, project scoping, language-based suggestions

Spec ID: SPEC-07
Status: draft
Supersedes: none

Extends [`skills.md`](./skills.md) (SPEC-01), which stays authoritative for
skill attachment/ordering via `agent_skills`, the trust-by-`source` model, the
content-scan gate, and versioning. This spec changes only what `source:
'community'` *means* (a live GitHub repository instead of an in-process
fixture) and adds two new dimensions — tags and project scoping.

Client-side counterpart (Community tab folder browser, tag chip colors, the
Settings catalog field, the per-project suggestion surface):
[`../../client/specs/community-catalog.md`](../../client/specs/community-catalog.md)
— see "Module interactions" below for the contracts it depends on.

## Changelog

- 2026-10-07 — robustness and validation amendment (user decisions R4, R5 and
  B7 in `docs/plans/2026-10-07-unfinished-features-and-critical-bugs.md`).
  AC-5 reworded in place: entry bodies are fetched from
  `raw.githubusercontent.com` during population (not from the REST API), and
  only the tree read counts against the 60/hr REST budget. Added AC-49
  (create-time `repo_id` ownership on `POST /skills`, previously only checked
  at import/update/list), AC-50/AC-51 (`repo_id` must be a UUID — or the
  `none` literal on the listing — else 422), AC-52/AC-53 (a failed entry body
  keeps the entry with AC-12-style fallback metadata; the catalog is
  unavailable only when the tree read fails — refines AC-31), AC-54 (in-flight
  population dedup). The "Inputs and provenance" body line and the
  request-budget NFR were corrected to match. Also fixed the stale "client
  companion not yet specified" note: the amendment's client behavior is now
  specified in the client spec (C-AC-53 – C-AC-58).
- 2026-10-02 — **amendment: reversed this spec's own "not a change to `GET
  /skills`' listing scope" non-goal**, which was explicitly confirmed during the
  original dialog. The Skills list can now be narrowed to one project (global
  skills + that project's skills) through an **opt-in** `repo_id` query
  parameter, and a skill's project scope became editable after creation in any
  direction, including back to global (AC-35 – AC-48). The *default*,
  parameter-less `GET /skills` is deliberately left workspace-wide, because the
  Agent editor's skill picker shares that endpoint (AC-40). Reason for the
  reversal: once skills are scoped across several projects, an unfiltered
  workspace-wide list is noise for whoever is working inside one project —
  which is the cost the original deferral did not anticipate.
- 2026-10-02 — relaxed AC-5's wording to match an accepted implementation
  tradeoff: producing real per-entry name/description/tags/type requires
  reading each entry's frontmatter, which lives in its body, so a literal
  "no entry body during listing" is unsatisfiable alongside AC-8/AC-11–14's
  requirement for real metadata. The accepted behavior (reviewed by
  architecture-reviewer and confirmed by the user) is: bodies are fetched
  once per cache-TTL-window *population*, not per listing request/page-view —
  a cache hit (AC-6) still issues zero outbound requests. AC-5 now states
  this explicitly instead of the stricter, unsatisfiable original wording.
- 2026-10-02 — resolved the last open question: legacy fixture-sourced
  `source: 'community'` rows are left as-is with no migration or marker
  (AC-34); spec has no remaining open items.
- 2026-10-02 — initial version

## Problem and user

The Add Skill drawer's Community tab searches `COMMUNITY_SKILLS`
(`modules/skills/constants.ts`) — four hand-written fixture entries with
fabricated star counts, carrying a single free-text `lang` field
(`'JavaScript/TypeScript'` or `'Any'`). Its own doc comment admits the design:
*"No live external index exists in this repo (same fixture-not-live-service
pattern as the seeded demo repo/PR)."*

The user maintains real, growing skill content in a GitHub repository of their
own (`KateySt/SKILLS`), organized into folders by language/topic, and has **no
way to get any of it into DevDigest**. The gap is distribution, not discovery:
there is no public commons to index and no social-proof metadata worth
surfacing — there is one authored catalog whose contents never reach the
product. Today the only paths in are "paste a URL per file" (`POST
/skills/import-url`, one skill at a time, no browsing) or retyping the body by
hand.

Two further gaps follow from that catalog being organized by language:

- A skill's applicability is a *set* of languages/topics, which the single
  `lang` string cannot express (`'JavaScript/TypeScript'` is one value
  pretending to be two).
- Nothing connects a skill's applicability to a project's actual languages,
  even though `repos.languages` already holds a bytes-per-language breakdown
  fetched from GitHub on every clone/refresh (`modules/repos/service.ts`) and
  no feature reads it for this purpose. A Python repo cannot be told that
  Python skills exist.

Finally, `skills` rows are scoped only to `workspaceId` and link to *agents*
via `agent_skills` — there is no project/repo dimension at all. Every imported
skill lands in one undifferentiated workspace-wide pile.

## Goals / Non-goals

**Goals**

- Replace the fixture catalog with a live catalog read from a configured
  GitHub repository, organized into top-level folders by language/topic.
- Define the catalog repository's layout as a **contract** the catalog author
  must satisfy, so parsing is deterministic and a malformed file degrades to a
  predictable entry instead of breaking the listing.
- Give every catalog entry a set of **tag slugs** (any number, folder name
  always among them) replacing the single `lang` string, and persist those tags
  on the skill when it is imported.
- Add an **additive, nullable project scope** to `skills` (`repo_id` null =
  global, non-null = project-scoped), with community imports always
  project-scoped.
- Proactively **suggest** catalog entries for a project whose stored language
  breakdown matches their tags, excluding entries already imported there.
- Make the catalog source configurable through the mechanisms this repo
  already has for non-secret config — an env default plus a visible,
  editable Settings override with a test action.
- Keep the catalog fetch inside a small, predictable upstream request budget
  that does not exhaust GitHub's unauthenticated rate limit during normal
  browsing.
- *(2026-10-02 amendment)* Let the skills listing be narrowed to one project's
  working set — global skills plus that project's skills — through an opt-in,
  **server-side** filter, without changing what the parameter-less listing
  returns.
- *(2026-10-02 amendment)* Make a skill's project scope **correctable after
  creation**, in any direction including back to global, without losing the
  skill's identity, version history, or scan state.

**Non-goals**

- **Global agents are not built here.** The forward-looking requirement is
  satisfied only to the extent that `skills.repo_id` is nullable from day one,
  so project scoping never has to be relaxed by a later migration. Nothing in
  this spec makes an *agent* global, and no UI for choosing global-vs-project
  scope is specified.
- **Not a multi-catalog or catalog-federation feature.** Exactly one catalog
  repository is resolved at a time.
- **Not a catalog mirror.** The catalog is never persisted to Postgres; only
  imported skills are stored.
- **No write path back to the catalog repository** — no publishing,
  contributing, or starring from DevDigest.
- **Not a change to how skills reach a prompt.** Attachment, ordering,
  enable-gating, and versioning stay exactly as SPEC-01 describes them.
- **Not a change to `GET /skills`' *default* listing scope.** *(2026-10-02
  amendment — narrowed from the original "not a change to `GET /skills`'
  listing scope … left to a later feature".)* The parameter-less listing stays
  workspace-wide (AC-36); project filtering is added strictly as an opt-in
  parameter alongside it, never as a new default.
- **Not tag filtering.** The original deferral covered "tag or project"; the
  2026-10-02 amendment un-defers *project* only. Filtering a skills listing by
  tag remains deferred.
- **Not a change to which skills reach a prompt.** `repo_id` remains an
  organizational dimension only. Nothing resolving skills for a run filters on
  it — `agent_skills` resolution stays repo-agnostic (AC-45), exactly as
  SPEC-01 describes.
- **Not an access-control boundary.** The project filter is a *view*. A skill
  scoped to another project stays readable by id, attachable from the Agent
  editor, and active in reviews; the workspace remains the only tenancy
  boundary.
- **Not per-user repo access control.** "Repos available to the user" means
  every repo in the workspace — there is no per-user repo ACL in this app and
  this amendment introduces none.
- **Not a multi-project scope.** A skill still carries at most one `repo_id`;
  no many-to-many scope is introduced.
- **No authenticated catalog access.** The catalog is a public repository and
  must work with no GitHub token configured at all.
- **No server-side tag→color mapping.** The server emits slugs; color is
  derived client-side.

## User stories

- As the catalog author, I add `python/pytest-discipline.md` to my GitHub
  repo and it appears in DevDigest's Community tab under a `python` folder
  without me touching DevDigest's code or database.
- As an engineer opening a Python project, I am shown Python-tagged catalog
  skills I have not imported yet, instead of having to guess the right search
  term in the Community tab.
- As an engineer who mistypes the catalog URL in Settings, I find out
  immediately from a failed test action, rather than from an
  indistinguishable-from-empty Community tab.

## Acceptance criteria (EARS)

### Catalog source resolution and configuration

- AC-1: WHEN the server loads its configuration, the system shall resolve a
  default catalog repository from the `COMMUNITY_CATALOG_REPO` environment
  variable, falling back to `KateySt/SKILLS` when the variable is unset or
  empty. (verify via: unit test)
- AC-2: WHERE a workspace has a `community_catalog_repo` setting value, the
  system shall resolve the catalog from that value instead of the environment
  default. (verify via: unit test)
- AC-3: IF a resolved catalog value does not denote a `github.com` repository
  in `owner/name` or GitHub URL form, THEN the system shall reject it as a
  configuration error and shall not issue any outbound request. (verify via:
  unit test)
- AC-4: WHEN the catalog test action is invoked, the system shall resolve the
  catalog, attempt a listing, and return a boolean outcome with a
  human-readable message stating the folder and entry counts on success or the
  failure reason on error, without modifying the stored setting. (verify via:
  integration test)

### Listing and caching

- AC-5: WHEN a catalog's cache is populated or refreshed, the system shall
  retrieve the repository's file tree in exactly one GitHub REST tree request,
  and MAY fetch each candidate entry's body once during that same population
  (needed for AC-8/AC-11–14's real name/description/tags/type) from the raw
  content host `https://raw.githubusercontent.com/{owner}/{name}/HEAD/{path}`
  rather than the GitHub REST API — but shall not issue any further tree or
  body request for that catalog until the next population (see AC-6: a cache
  hit issues zero outbound requests). *(2026-10-07: body host pinned to the raw
  host.)* (verify via: integration test)
- AC-6: WHILE a cached catalog listing is younger than the catalog cache TTL,
  the system shall serve listings from that cache and issue no outbound
  request. (verify via: unit test)
- AC-7: WHEN a catalog refresh is explicitly requested, the system shall
  discard the cached listing and re-fetch from upstream. (verify via:
  integration test)
- AC-8: WHEN the catalog is listed, the system shall return each entry's
  repo-relative path, folder, name, description, tag slugs, and type, and
  shall not return a star count or a single-language field. (verify via:
  integration test)

- AC-54: WHILE a population of a catalog's cache is in flight, the system
  shall serve every further listing request for that same catalog from that
  in-flight population rather than starting another, so concurrent cache-miss
  requests cause exactly one tree request. (verify via: unit test)

### Catalog layout contract

- AC-9: WHEN the catalog tree is parsed, the system shall treat a file as a
  catalog entry only if it has a `.md` extension and sits exactly one level
  below the repository root. (verify via: unit test)
- AC-10: WHEN the catalog tree is parsed, the system shall exclude any file
  named `README.md` even where it otherwise satisfies AC-9. (verify via: unit
  test)
- AC-11: WHEN an entry is parsed, the system shall include its containing
  folder's name as a tag slug in addition to every tag declared in the entry's
  frontmatter, with no duplicate slugs. (verify via: unit test)
- AC-12: IF an entry has no YAML frontmatter, THEN the system shall resolve
  its description to an empty string, its tags to the folder name alone, and
  its type to `custom`. (verify via: unit test)
- AC-13: IF an entry's frontmatter `type` is not a member of the `SkillType`
  enum, THEN the system shall resolve its type to `custom`. (verify via: unit
  test)
- AC-14: WHEN an entry's name is resolved, the system shall use the first
  markdown heading of its body, falling back to the filename without its
  extension. (verify via: unit test)
- AC-15: WHEN a text query is supplied with a listing request, the system
  shall return only entries whose name or description contains it,
  case-insensitively. (verify via: unit test)
- AC-16: WHEN a tag slug is supplied with a listing request, the system shall
  return only entries carrying that slug. (verify via: unit test)

### Import

- AC-17: WHEN a catalog entry is imported, the system shall identify it by its
  repo-relative path rather than its name. (verify via: integration test)
- AC-18: WHEN a catalog entry is imported, the system shall fetch that single
  entry's body from the catalog repository and persist it with `source:
  'community'`, `enabled: false`, the entry's resolved tags, and the requested
  project's `repo_id`. (verify via: integration test)
- AC-19: WHEN an entry body is fetched, the system shall abort the fetch after
  the import fetch timeout and truncate the body at the import byte cap.
  (verify via: unit test)
- AC-20: IF a community import request carries no `repo_id`, THEN the system
  shall reject it with a validation error and persist nothing. (verify via:
  integration test)
- AC-21: IF a community import request's `repo_id` does not belong to the
  caller's workspace, THEN the system shall reject it and persist nothing.
  (verify via: integration test)
- AC-22: IF the requested path is absent from the current catalog listing,
  THEN the system shall reject the import as not found. (verify via:
  integration test)
- AC-49: IF a `POST /skills` request carries a `repo_id` that does not belong
  to the caller's workspace, THEN the system shall reject it with a validation
  error and persist nothing. (verify via: integration test)
- AC-50: IF a `repo_id` in the body of `POST /skills`, `PUT /skills/:id`, or
  `POST /skills/import-community` is present and not a UUID (null remains
  allowed on `PUT /skills/:id`), THEN the system shall reject the request with
  422 and persist nothing. (verify via: integration test)
- AC-51: IF the `repo_id` query parameter of `GET /skills` is neither a UUID
  nor the literal `none`, THEN the system shall reject the request with 422.
  (verify via: integration test)

### Project scoping

- AC-23: WHEN a skill is created through the manual/file path without a
  project, the system shall persist a null `repo_id` and treat the skill as
  global. (verify via: unit test)
- AC-24: WHEN skills are listed for a workspace, the system shall return every
  skill regardless of `repo_id`, each carrying its project scope. (verify via:
  integration test)
- AC-25: WHEN a repo is deleted, the system shall delete the skills scoped to
  it and leave global skills intact. (verify via: integration test)
- AC-34: WHEN the project-scope column is introduced, the system shall leave
  every pre-existing skill row untouched — including rows already stored with
  `source: 'community'` from the removed fixture — so that each retains a null
  `repo_id` and a null `tags` value and is treated as a global skill. (verify
  via: integration test)

### Project scope filtering and reassignment (2026-10-02 amendment)

Added by the amendment that reversed this spec's "not a change to `GET /skills`'
listing scope" non-goal. AC-24 above still holds — as the *default* behavior
(restated as AC-36) rather than as the only behavior.

**Filtered listing**

- AC-35: WHEN skills are listed with a project filter, the system shall return
  only skills whose `repo_id` is null or equals that project, each carrying its
  project scope. (verify via: integration test)
- AC-36: WHEN skills are listed with no project filter, the system shall return
  every skill in the workspace regardless of `repo_id` — AC-24's behavior,
  retained as the default. (verify via: integration test)
- AC-37: WHEN skills are listed with the global-only scope, the system shall
  return only skills whose `repo_id` is null. (verify via: integration test)
- AC-38: IF a listing's project filter does not denote a repo in the caller's
  workspace, THEN the system shall reject the request and return no skills.
  (verify via: integration test)
- AC-39: WHERE a listing is filtered, each returned skill's usage summary shall
  be identical to the value that same skill carries in an unfiltered listing.
  (verify via: integration test)
- AC-40: WHEN the Agent editor's skill picker lists skills, the system shall
  serve it the unfiltered default and shall return every skill in the
  workspace. (verify via: integration test)

**Reassignment**

- AC-41: WHEN a skill is updated with a project scope, the system shall persist
  it as that skill's `repo_id` without creating a new skill row and without
  changing the skill's id. (verify via: integration test)
- AC-42: IF an update's project scope does not denote a repo in the caller's
  workspace, THEN the system shall reject it and persist nothing. (verify via:
  integration test)
- AC-43: WHEN a skill's project scope is cleared, the system shall persist a
  null `repo_id` and treat the skill as global thereafter, regardless of that
  skill's `source`. (verify via: integration test)
- AC-44: WHEN a skill's project scope changes and its body does not, the system
  shall leave `version` unchanged, shall write no `skill_versions` row, and
  shall not re-run the content scan. (verify via: unit test)
- AC-45: WHEN a skill's project scope changes, the system shall leave that
  skill's `agent_skills` links untouched and shall leave the set of skill bodies
  reaching any agent's assembled prompt unchanged. (verify via: integration
  test)

**Accepted consequences of a scope change**

- AC-46: WHERE a community skill's project scope changes — to a different
  project, or cleared to global — the system shall treat it as imported into
  the new scope and no longer into the old one for suggestion exclusion
  (AC-28); a global scope excludes it from no project's suggestions. (verify
  via: integration test)
- AC-47: WHERE a previously global skill has been given a project scope, WHEN
  that project is deleted, the system shall delete the skill — AC-25's cascade
  applies to it from that point on. (verify via: integration test)
- AC-48: WHERE a previously project-scoped skill has been cleared to global,
  WHEN its former project is deleted, the system shall retain the skill.
  (verify via: integration test)

### Project suggestions

- AC-26: WHEN suggestions are requested for a project, the system shall return
  catalog entries carrying at least one tag slug matching a qualifying
  normalized language slug of that project. (verify via: integration test)
- AC-27: WHERE a project language accounts for less than 5% of that project's
  total language bytes, the system shall not treat it as a qualifying language
  for matching. (verify via: unit test)
- AC-28: WHEN suggestions are produced, the system shall exclude every entry
  whose path has already been imported into that project. (verify via:
  integration test)
- AC-29: WHEN language names are normalized to tag slugs for matching, the
  system shall require an exact slug match and shall not treat `typescript`
  and `javascript` as equivalent. (verify via: unit test)
- AC-30: IF a project has no stored language breakdown, THEN the system shall
  return an empty suggestion list rather than an error. (verify via:
  integration test)

### Degradation

- AC-31: IF the catalog cannot be retrieved, THEN the system shall return an
  explicit unavailable outcome naming the configured catalog, and shall not
  return fixture, placeholder, or stale-beyond-TTL entries in its place.
  (verify via: integration test)
- AC-32: IF the catalog cannot be retrieved WHEN suggestions are requested,
  THEN the system shall return an empty suggestion list together with an
  unavailable indicator, and shall not return an error status. (verify via:
  integration test)
- AC-52: IF an individual entry's body fetch fails or times out during
  population, THEN the system shall keep that entry in the listing with
  AC-12-style fallback metadata — name from the filename without extension,
  empty description, tags = the folder name alone, type `custom`. (verify via:
  unit test)
- AC-53: WHEN the tree read succeeds, the system shall report the catalog as
  available even if some or all entry body fetches failed; the system shall
  return AC-31's unavailable outcome only when the tree read itself fails.
  (verify via: unit test)

### Security gate

- AC-33: WHEN a catalog entry's body is imported, the system shall run the
  existing skill content scan on it and record the scan status and findings on
  the stored skill, with no bypass for the configured catalog. (verify via:
  integration test)

## Edge cases

- **Entry name collision across folders.** `python/naming.md` and
  `go/naming.md` both resolve to the name "Naming" — correct and expected;
  identity is the path (AC-17), so both are independently listable and
  importable.
- **A folder with no valid entries** (only a `README.md`, only non-`.md`
  files, or only nested subfolders) contributes no entries and therefore does
  not appear as a folder at all.
- **Deeper nesting is silently ignored**, not an error: `python/testing/x.md`
  simply is not a catalog entry (AC-9). A catalog author who nests will see
  their file missing rather than a diagnostic — accepted, since the layout is
  a documented contract.
- **Frontmatter that parses but has wrong types** (`tags: "python"` as a
  string rather than a list, `description` as an object) is treated like
  absent frontmatter for the offending field, per AC-12/AC-13 — never a
  listing-wide failure. One malformed entry must not blank out the catalog.
- **Empty catalog** (repository reachable, zero qualifying entries) is a
  successful empty listing, which is distinct from AC-31's unavailable
  outcome. These two must not be collapsed into one state.
- **Same entry imported twice into the same project** — produces a second
  skill row; nothing deduplicates skills today and this spec adds no
  uniqueness constraint. The suggestion list stops recommending it after the
  first import (AC-28), but the Community tab's Import button is not blocked.
- **A repo whose `languages` is stale** (never refreshed since new languages
  were added) produces suggestions from the stale breakdown; this spec never
  triggers a language refetch (see "Inputs and provenance").
- **A project whose only qualifying language has no matching tag** yields an
  empty suggestion list — a normal, non-degraded empty state.
- **Catalog repository's default branch is not `main`** — resolution must
  follow the repository's actual default branch rather than assuming a name.
- **Entry body larger than the byte cap** is truncated (AC-19), which can cut
  a skill mid-sentence. It is still scanned and stored; the human enable-gate
  from SPEC-01 is where a truncated body gets caught.
- **Legacy fixture-sourced skills** — rows imported from the removed fixture
  before this feature are deliberately left alone (AC-34): no migration, no
  backfill, no marker distinguishing them from live-catalog imports. They
  become ordinary global (`repo_id = null`), tag-less (`tags = null`)
  `source: 'community'` skills, which is consistent with the additive
  zero-backfill scoping decision. Consequence accepted: such a skill shows no
  tag chips and belongs to no project, and nothing in the product explains
  why.
- **Rate limit exhausted upstream** is an unavailable outcome (AC-31), not a
  silent empty catalog — the message must distinguish it from a bad URL so a
  user does not "fix" a working configuration.
- *(2026-10-07)* **Some entry bodies fail during population** (raw host
  hiccup, timeout, a file deleted between tree read and body read): the
  listing stays available and the affected entries appear with fallback
  metadata (AC-52, AC-53). One bad body must not blank out the catalog. Such
  an entry is still importable; the import fetches its body again (AC-18) and
  fails on that row if the body is still unreachable.
- *(2026-10-07)* **Concurrent first visits** (two drawers opened at once on a
  cold cache) share one population (AC-54) instead of each spending a tree
  request.

*(2026-10-02 amendment)*

- **No resolvable current project** (zero repos connected, or a remembered repo
  that no longer exists) resolves to the **global-only** scope (AC-37), not to
  the unfiltered list. Chosen deliberately over failing open: a list that
  silently widens to every project is indistinguishable from a working filter.
  Note that "repos still loading" and "confirmed zero repos" are two different
  states that must not be collapsed into this one — that distinction is client
  behavior (`client/INSIGHTS.md`, 2026-09-15).
- **A skill scoped to another project is invisible on a filtered list but fully
  live.** It stays readable by id, stays attachable from the Agent editor
  (AC-40), and still reaches the prompt of any agent it is linked to, for
  reviews of *any* repo (AC-45). Consequence accepted: a filtered list reads
  like "the skills that apply here" and is not that, and nothing in the product
  corrects the impression.
- **AC-20 is an import-time requirement, not an immutability guarantee.** An
  import carrying no `repo_id` is still rejected, but the stored value is
  mutable afterwards (AC-43) — so a community skill can reach a global state it
  could never have been *created* in.
- **A community skill cleared to global stops being excluded from every
  project's suggestions.** AC-46 applied to the null case: the skill is now
  "imported into" no project, so the catalog entry it came from becomes
  suggestable again for every qualifying project, including the one it was
  originally imported into. Accepted — nothing deduplicates skills (see the
  double-import edge case above), so re-importing produces a second row.

## Non-functional requirements

- **Upstream request budget.** Normal browsing must cost at most one upstream
  REST tree request per cache TTL window, independent of how many folders,
  users, or searches are involved (concurrent cold-cache requests included,
  AC-54); importing costs exactly one additional raw-host request per imported
  entry. Entry bodies are read from `raw.githubusercontent.com`, which does not
  count against the REST rate limit (*2026-10-07*). This is what keeps the
  feature inside GitHub's unauthenticated 60-requests-per-hour REST floor,
  which is the budget this feature must assume (the catalog is public and must
  work with no token configured).
- **Bounded external reads.** Every outbound catalog request is time-bounded
  and size-capped, reusing the same discipline as `importFromUrl`'s
  `IMPORT_URL_TIMEOUT_MS` / `IMPORT_URL_MAX_BYTES` guards, so a slow or huge
  response can neither hang a request nor bloat storage.
- **Abuse-resistant endpoints.** The refresh and test actions are
  user-triggered actions that each cause upstream traffic, so both carry a
  per-route rate limit in the style of `POST /settings/test-connection`'s
  existing `{ max: 20, timeWindow: '1 minute' }`.
- **Supply-chain security.** Catalog content is third-party content even when
  the catalog belongs to the user: anyone able to merge into that repository,
  or anyone who compromises the account, can inject prompt text. The content
  scan and the `enabled: false` default therefore remain mandatory and
  unconditional for every community import — there is no trusted-catalog
  bypass.
- **No SSRF surface.** Because the catalog location is editable from Settings,
  it is user input that determines an outbound request target; it must be
  constrained to `github.com` repositories (AC-3) rather than accepted as an
  arbitrary URL.
- **Diagnosability.** Catalog resolution and fetch outcomes — which catalog
  was used, cache hit or miss, upstream status, parse rejections — must be
  logged, since every failure mode of this feature looks identical ("the
  Community tab is empty") from the UI.

*(2026-10-02 amendment)*

- **The project filter is indexed and must not cost more than no filter.**
  `skills_repo_idx` already exists (added for AC-25's cascade), so filtering is
  an indexed lookup needing no new index; and narrowing rows *before* the usage
  aggregation is strictly less work than the existing unfiltered path. A
  filtered listing must therefore never be slower than an unfiltered one.
- **The filter is not authorization.** Narrowing a listing by project must never
  be relied on to keep a skill from anyone — the workspace stays the only
  tenancy boundary. Stated as a requirement because a scope filter invites being
  mistaken for an access-control boundary by whatever is built next.
- **Project scope is ownership-checked on both the read and the write path.**
  The listing filter (AC-38) and the reassignment (AC-42) each validate that the
  named repo belongs to the caller's workspace — the same check AC-21 already
  applies at import, now required in two more places. *(2026-10-07)* Manual
  creation (AC-49) is the fourth place, and every `repo_id` is shape-checked as
  a UUID before any lookup (AC-50, AC-51).

## Inputs and provenance

- [deterministic: env + settings row] Catalog repository location — the
  `COMMUNITY_CATALOG_REPO` env default, overridden by the workspace's
  `community_catalog_repo` setting.
- [deterministic: GitHub tree API] Catalog file tree — one recursive tree read
  of the catalog repository's default branch; the sole source of folders and
  entry paths.
- [deterministic: GitHub raw content host] An entry's markdown body — fetched
  from `raw.githubusercontent.com/{owner}/{name}/HEAD/{path}` once per cache
  population (for metadata, AC-5) and once more at import time (AC-18); never
  on a cache hit. *(2026-10-07: the earlier "only at import time" wording
  predated AC-5's 2026-10-02 relaxation and was stale.)*
- [deterministic: parsed from the above] Entry name, description, tags, and
  type — derived from the folder name, the YAML frontmatter, and the body's
  first heading per AC-11 through AC-14.
- [reused: `repos.languages`] Project language breakdown — already fetched and
  persisted by the repos module on clone/refresh. This feature reads it only;
  it never triggers a refetch and tolerates `null`.
- [deterministic: in-process mapping] GitHub language name → tag slug
  normalization, and the 5% byte-share qualifying threshold.
- [reused: SPEC-01 behavior] Attachment/ordering via `agent_skills`, the
  `enabled` gate, and body versioning — unchanged, not re-derived here.
- [new: 1 LLM call per imported skill] Content scan of the imported body, via
  the existing `skill_scan` feature-model resolution and `scanBody` path. No
  LLM call occurs during listing, browsing, or suggestion.
- Tag colors are **not an input** — the server emits slugs only, and color is
  derived client-side from the slug.

*(2026-10-02 amendment)*

- [reused: the client's active-repo resolution] The current project a listing is
  filtered to — resolved client-side (URL `:repoId` > remembered repo > first
  repo, the same resolution the Community tab's project picker already uses) and
  passed in as a request parameter. The server never resolves "current project"
  itself; it only honors what it is given.
- [reused: the workspace's repo list] The choices offered when reassigning a
  skill's project — the existing workspace-scoped repo listing, with no
  per-user filtering and no new endpoint.
- [deterministic: the existing `skills.repo_id` column] Both the filter and the
  reassignment read and write the column SPEC-07 already added — no new column
  and no migration.
- [new: 0 LLM calls] This amendment adds no model call on any path. A scope
  change explicitly does not re-run the content scan (AC-44), so reassignment is
  free of LLM cost.

## Untrusted inputs

Everything read from the catalog repository is untrusted: entry bodies,
frontmatter values, filenames, and folder names all originate from a public
GitHub repository and can be changed by anyone with merge access to it.

- **Entry body** — scanned through the existing `scanBody` path, which wraps
  it as `<untrusted source="skill-body">` so the scanner cannot be hijacked by
  the content it classifies, and stored `enabled: false`. SPEC-01's reasoning
  is unchanged: the body is never delimiter-wrapped at review time, because
  the trust boundary is the human enable-gate, not prompt-level wrapping.
- **Frontmatter `type`** — validated against the `SkillType` enum with a
  `custom` fallback (AC-13); never written through to the database as-is.
- **Frontmatter `tags`** — normalized to a slug character set and
  de-duplicated before storage or display, so a tag cannot carry markup or
  arbitrary length into the UI.
- **Frontmatter `description` and resolved name** — treated as display text
  and length-capped, never as instructions.
- **Entry path, filename, and folder name** — validated against AC-9's exact
  one-level `.md` shape, so a crafted tree path cannot be used to address
  anything outside the catalog's intended surface.
- **Entry body size and fetch duration** — capped and time-bounded per AC-19.
- **The configured catalog location itself** — user input from Settings that
  determines an outbound request target; constrained to `github.com`
  repositories per AC-3.
- *(2026-10-02 amendment)* **The project scope on the listing and update paths**
  — a client-supplied identifier naming a database row, validated against the
  caller's workspace before use (AC-38, AC-42). The global-only scope is a
  reserved literal matched exactly, never interpolated into a query. Unlike
  catalog content, this is untrusted *addressing* rather than untrusted text:
  nothing here reaches a prompt, so the risk is cross-workspace reference, not
  injection.

## Module interactions / API contracts

**Server endpoints** (contract the client depends on)

- `GET /skills/community` — replaces the fixture search. Query: text query and
  optional tag slug (the `lang` parameter is removed). Returns the full set of
  catalog entries with folder/path/name/description/tags/type, plus an
  availability indicator; the client groups entries into folders from this one
  payload rather than calling a per-folder endpoint. Serving the whole listing
  from a single cached payload is what makes AC-5's one-request budget
  possible.
- `POST /skills/import-community` — body changes from `{ name }` to a
  repo-relative `path` plus a **required** `repo_id`.
- A catalog refresh action invalidating the cached listing (AC-7).
- `GET /repos/:id/skill-suggestions` — new, repo-scoped, returning matching
  non-imported catalog entries plus the availability indicator (AC-26–AC-32).
- A catalog test action for Settings, returning the same
  `{ ok, message }`-shaped outcome as `POST /settings/test-connection` (AC-4).
- `POST /skills` — gains an optional `repo_id` (absent ⇒ global, AC-23);
  *(2026-10-07)* when present it must be a UUID (AC-50) naming a repo in the
  caller's workspace (AC-49).

*(2026-10-02 amendment)*

- `GET /skills` — gains an **optional** project-scope query parameter with three
  states: a repo id ⇒ global skills + that repo's skills (AC-35); the reserved
  literal `none` ⇒ global skills only (AC-37); **omitted ⇒ every skill in the
  workspace, exactly as before** (AC-36). Three states on one parameter rather
  than two parameters, so "what scope is this list?" stays one dimension with no
  undefined combinations. The omitted-is-unchanged default is what keeps the
  Agent editor's skill picker working untouched (AC-40) — it shares this
  endpoint with the Skills page.
- `PUT /skills/:id` — gains an optional project scope accepting a repo id or
  null (AC-41, AC-43). This is genuinely new surface: the update body carries no
  project scope today, so unlike the listing change this cannot be done by
  widening an existing field.
- **No shared-contract change.** `Skill` already carries `repo_id` as
  `.nullish()` from the original SPEC-07 work, and these two request shapes are
  route-local validation rather than vendored contracts — so the
  edit-both-trees-then-diff-the-touched-file discipline (`server/INSIGHTS.md`,
  2026-09-30) does not apply to this amendment. The client's own patch type does
  need widening, which is client-side work.

**Shared contracts** (`src/vendor/shared/contracts/knowledge.ts`)

- `CommunitySkill` loses `stars` and `lang`, and gains `path`, `folder`, and
  `tags` (plus `type`).
- `Skill` gains `repo_id` and `tags`. Per `server/INSIGHTS.md` (2026-09-15),
  both must be declared `.nullish()`, not required — `Skill` is produced by
  several paths that will not fill them, and a required field breaks typecheck
  at every unrelated producer.
- Per `server/INSIGHTS.md` (2026-09-30), the identical edit must be applied by
  hand to **both** `server/src/vendor/shared/` and `client/src/vendor/shared/`,
  then diffed **only for the touched files** — a whole-tree diff is no longer
  a usable parity check, and `contracts/knowledge.ts` is specifically one of
  the five files already known to have drifted between the two trees.

**Cross-module dependencies inside `server/`**

- **repos module** — read-only consumer of `repos.languages` for matching; and
  the `repo_id` FK's cascade is what gives AC-25 its behavior.
- **settings module** — a new `community_catalog_repo` key in the typed
  `SettingsKnown` contract, served and persisted by the existing
  `GET`/`PUT /settings` path. It is deliberately **not** a `SecretsProvider`
  entry: the catalog location is non-secret, must be displayable, and
  `platform/config.ts` reserves `SecretsProvider` for secret keys.
- **platform config** — a new `COMMUNITY_CATALOG_REPO` env entry in the
  zod-validated `AppConfig`, in the style of the existing optional env flags.
- **GitHub access** — the catalog fetch must **not** depend on an
  authenticated client. `container.github()` throws a `ConfigError` when
  `GITHUB_TOKEN` is unconfigured, so routing a public-catalog read through it
  would make the whole feature unavailable to exactly the tokenless local-first
  setup this app targets. The catalog needs tree-listing and raw-file reads,
  neither of which exists on the `GitHubClient` port today (it exposes only
  PR/issue/commit/language operations), so a capability for them must be
  introduced; whether that is a new port method, a separate adapter, or a
  guarded direct fetch is an implementation decision, not a contract.

**Client (out of scope here, depends on the above)**

Tag chip colors derived from slugs, the folder browser in the Community tab,
the Settings catalog field with its test action, and the per-project
suggestion surface are all client behavior, specified in
[`../../client/specs/community-catalog.md`](../../client/specs/community-catalog.md).

*(2026-10-02 amendment; corrected 2026-10-07)* The amendment's own client-side
behavior — the Skills page's visible project-scope switcher, the repo-picker
field in the Skill editor's Config tab, the loading-vs-confirmed-zero-repos
distinction behind the global-only fallback, and widening the client's
skill-update patch type to carry a project scope — shipped in 075b562 and is
specified in the same client spec as C-AC-53 – C-AC-58.

## Open questions

None — all items raised during the original spec dialog are resolved (see AC-34
and the "legacy fixture-sourced skills" edge case for the last one), and the
2026-10-02 amendment's dialog closed every item it raised: reassignment is
allowed for any skill in any direction including back to global, the global-only
scope is a reserved `none` literal on the existing parameter, and a scope change
alone bumps no version, writes no snapshot, triggers no re-scan, and touches no
agent link.
