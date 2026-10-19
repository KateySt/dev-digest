# Pagination for long lists + support for the Electron minimum window — Development Plan

Date: 2026-10-19 · Base: `origin/main` @ 0863c79 (v0.2.2) · Status: **revised after review (2026-10-19) — decisions in Part 4; not implemented yet**

Two related problems:

1. **Long lists render everything at once.** No list endpoint supports
   offset/cursor paging, and several are **silently capped**: Memory returns at
   most 200 items, CI Runs 50, notifications 50. Older data is unreachable
   without the user knowing.
2. **The desktop window can shrink to 1024 × 640** (`desktop/src/main.ts`
   `minWidth: 1024, minHeight: 640`). Some pages don't fit that size well.

Skills to load when implementing: `tanstack-query` (paged queries,
`placeholderData: keepPreviousData`), `react-project-structure`,
`react-best-practices`, `fastify-best-practices` + `onion-architecture`
(server paging), `drizzle-orm-patterns` (count + offset queries),
`web-design-guidelines` (pagination accessibility).

---

## Part 1 — Which lists need pagination

Legend — **Server**: the API pages (offset + total). **Client**: the whole
list is already in memory; the UI shows one page at a time. **No**: keep as is.

| # | Page / surface | Data today | Grows with | Decision | Why |
|---|---|---|---|---|---|
| L1 | **Pull Requests** (`/repos/:id/pulls`) | `GET /repos/:id/pulls` returns **every** PR and syncs from GitHub on each call; status tabs, search, sort and Triage run client-side | every synced PR, incl. merged/closed — unbounded | **Server (decided)** | Status, search, sort (incl. the composite "Highest risk" order from `pulls/helpers.ts` `compareByRisk`: size bucket → blast size → score) and per-status counts move to SQL; the GitHub sync is split from the read (see Part 4). |
| L2 | **Memory** (`/memory`) | `GET /memories`, filters already server-side, **silent cap 200** | every learned item — unbounded | **Server** | Only way to reach items past 200; filters already live on the server. |
| L3 | **CI Runs** (`/ci-runs`) | `GET /ci-runs`, 5 filters server-side, **silent cap 50** | every CI run — unbounded | **Server** | Same reasoning; the cap hides history today. |
| L4 | **Eval cases** (Agent/Skill editor → Evals tab, eval dashboards) | `GET /eval-cases?owner…`, whole set | every "Turn into eval case" | **Client** | Tens–low hundreds per owner; filters are client-side. |
| L5 | **Eval run history** (agent / skill eval dashboards) | full history per owner | every suite run | **Client** | Same scale as L4. |
| L6 | **Conventions** (`/conventions`) | `GET /repos/:id/conventions`, whole set, grouped | per repo, tens–hundreds | **Client** | Moderate size, grouped UI; page within the flat list. |
| L7 | **Skills grid** (`/skills`) | `GET /skills`, client search | imports + custom, tens | **Client** | Page sizes in multiples of columns (12/24/48). |
| L8 | **Agent Stats → run history** | `GET /agents/:id/runs?limit=` | every review run | **Server** (endpoint already takes `limit`; add `offset` + total) | Cheap extension of an existing param. |
| L9 | **Multi-Agent → recent runs** | `GET /multi-agent-runs?limit=10` | every multi-run | **Server** (same as L8) | Today only the last 10 are reachable. |
| L10 | **Notifications** popover | `LIST_LIMIT` 50, retention 200 | every finished job | **"Load more"**, not pages | A feed in a popover: page numbers don't fit; append the next 50. |
| — | Agents grid | few agents | slowly | **No** (component hides itself when everything fits on one page) | |
| — | Agent Performance table, PR Overview panels, Settings | bounded | — | **No** | |
| — | PR → Files changed (129 files in a real PR) | whole diff | PR size | **Not pagination** — follow-up: collapsed files + file tree + virtualization | Paging a diff breaks reading flow; different pattern. |
| — | Community catalog drawer, Project Context tree | accordion / tree + search | — | **No** | Already navigated by structure + search. |

Rule for every paged list: **filters, search and sort apply to the whole
list first, then paging** (page 3 of "Needs review", not page 3 of
everything). Changing a filter/search/sort/page size resets to page 1.

---

## Part 2 — The pagination control (design)

One shared component, `client/src/components/pagination/` (built on the
shadcn `pagination` primitive, added with the shadcn CLI), used by every
paged list.

### Anatomy (wide container)

```
Showing 26–50 of 312        Rows per page [ 25 ▾ ]     «  ‹  1  …  4  5 [6] 7  8  …  13  ›  »     Page [ 6 ] of 13
└ range summary ┘           └ page size ┘              └ first/prev, numbers with ellipsis, next/last ┘   └ direct jump ┘
```

- **Range summary** "Showing 26–50 of 312" (or "312 pull requests") — users
  care about *where they are in the data*, not just the page number.
- **Page size** (decided, see Part 4): tables **10 / 25 / 50 / 100**, default
  **25**; card grids **12 / 24 / 48**, default **24**; minimum 10. Remembered **per list** in `localStorage`
  (`dd-per-page:<listKey>`) — a per-viewer convenience, same as the split-pane
  width. On change, keep the **first visible item** on screen:
  `newPage = floor(firstIndex / newSize) + 1`, instead of jumping back to page 1.
- **Numbered pages with ellipsis**: first and last page always shown, one
  sibling on each side of the current page (`1 … 4 5 [6] 7 8 … 13`), so the
  control width stays constant while paging. Current page has
  `aria-current="page"`.
- **First / Prev / Next / Last** buttons (`«` `‹` `›` `»`), disabled at the
  ends, each with an aria-label ("Go to first page").
- **Direct jump — the answer to "arrows aren't enough"**:
  1. `Page [ 6 ] of 13` — a small number input. Type a page and press
     **Enter** (or blur) to jump. Out-of-range or non-numeric input is clamped
     to `1…last` and the field shows the page actually opened. Esc reverts.
     ↑/↓ in the field step ±1.
  2. Clicking an **ellipsis** (`…`) opens the same input in a small popover
     anchored to it — so the hidden range is one click away instead of five
     arrow clicks.

### Compact variant (narrow containers)

Lists inside split panes and the minimum window are narrow, so the control
adapts to **its container's width** (Tailwind v4 `@container` queries, not
viewport breakpoints):

```
≥ 640px   full layout (above)
< 640px   312 items · [25 ▾]          ‹  Page [ 6 ] of 13  ›
< 380px   ‹  6 / 13  ›     (tap the "6 / 13" to edit)
```

### Behaviour

- **URL state**: `?page=6&per=25` via `router.replace` (shareable, survives
  reload, Back returns to the previous page). Lists that share a URL with
  others (e.g. eval cases inside the Agent editor) use a prefix
  (`?cases_page=`). Invalid values are clamped, never an error page.
- **Out of range after deletes** (last item on the last page removed) → clamp
  to the new last page.
- **Scroll + focus**: on page change, scroll the list's own scroll container
  to the top and move focus to the list heading (screen readers announce the
  new range via an `aria-live="polite"` region holding the summary).
- **Loading**: server-paged lists keep the previous page visible while the
  next one loads (`placeholderData: keepPreviousData`) with a subtle busy
  state on the control — no flash to a skeleton.
- **Hidden when unnecessary**: `total ≤ smallest page size` → render nothing.
- **Keyboard**: two new registry commands (SPEC-11), page-scoped like the
  findings keys: `list.nextPage` / `list.prevPage`, default `]` / `[`
  (single-key → respects the single-key switch, rebindable in Settings →
  Keyboard). The innermost mounted list owns them.
- **Accessibility**: `<nav aria-label="Pagination">`, real `<button>`s with
  labels ("Go to page 7"), visible focus ring, 32px hit targets, the number
  input labelled "Page number".

### API shape (server-paged lists)

`GET /memories?page=2&per_page=25&…filters` →
```json
{ "items": [ … ], "total": 312, "page": 2, "per_page": 25 }
```

- Offset paging (`LIMIT/OFFSET` + `count(*)` with the same filters), not
  cursors: users want page numbers and "jump to page 9", which cursors can't
  do, and the data is local (PGlite/Postgres), so `OFFSET` cost is
  negligible at these sizes.
- Deterministic order (sort column + `id` tie-breaker) so rows never repeat
  or vanish between pages.
- `per_page` validated (1–100), `page` ≥ 1; a page past the end returns an
  empty `items` with the real `total` (the client clamps).
- **Backward compatible**: without `page`, the endpoint keeps returning
  today's bare array (desktop builds already in the field talk to the
  bundled API only, but tests and the course template rely on it). The
  silent caps (200/50) stay only on the legacy shape.
- Contract types added to `@devdigest/shared` (`Paged<T>`), vendored copies
  re-synced the usual way.

---

## Part 3 — Electron minimum window (1024 × 640): findings

Checked every studio route at a 1024 × 640 viewport — the content area is
**768 px** wide (sidebar is a fixed 264 px, `collapsible="none"`) and the page
area under the top bar is ~588 px tall. Measured in the DOM (horizontal
scroll containers, overflow past the viewport, wrapped controls); demo data
only, so very long content wasn't exercised.

**Fine at the minimum size**: PR detail (Overview / Agent runs / Files
changed), Onboarding tour, Project Context, Skills (list 340 + editor 420 =
exactly 760), Conventions, Settings sections, Agent/Skill eval dashboards.
No page scrolls the whole document sideways.

**Problems found:**

| # | Where | What happens at 1024 px | Proposed fix |
|---|---|---|---|
| M1 | **Agents** split | List min 340 + editor min 480 = 820 > 768 → list gets 288 px; agent cards (min 280) + padding overflow → horizontal scroll inside the list (312 > 270) | Card grid min 240 px, tighter list padding below 360 px (container query); editor min 440 |
| M2 | **Agent editor tabs** (Config, Skills, Context, Evals, Stats, CI) and **Skill editor tabs** | Tabs need 578 px, get 470 → horizontal scrollbar under the tabs; last tab cut ("Ve…" in the Skill editor) | Tabs switch to icon + short label, then icon-only with tooltip, by container width; never a scrollbar |
| M3 | **Pull Requests table** | Table min width 1070 px in a 694 px card → horizontal scroll to see Score/Findings/Status | Responsive columns by container width: Author and Size fold into a second line under the title; Score stays; Findings + Status merge |
| M4 | **Top bar** | 260 px search + breadcrumb crowd; while repos load the breadcrumb shows the raw repo UUID | Search collapses to an icon button (still Ctrl/⌘+K) below ~1100 px; breadcrumb truncates the middle; show a placeholder, never an id |
| M5 | **Memory** | Fixed 3 columns `220px · 1fr · 360px` → the main list column gets ~160 px | Below ~1100 px: filters become a collapsible rail and the detail column opens as a side sheet (or reuse `SplitPane`) |
| M6 | **Sidebar** | Always 264 px (`collapsible="none"`), 26 % of a 1024 px window | Enable icon-rail collapse (`collapsible="icon"`, 48 px) via `sidebar.toggle` (Ctrl/⌘+B, already a command); auto-collapse below ~1200 px window width, user choice remembered |
| M7 | **Eval dashboard** run table | 706 px in 685 px → small horizontal scroll | Tighter column widths / truncate Version |
| M8 | **Height 640** | Sidebar nav scrolls (fine); PR detail header + tabs use ~280 px, leaving ~300 px for content | Compact PR header below 720 px height (title one line, meta inline) |

Not checked (call out in the PR): the running Electron window itself (the
browser emulation matches its viewport, but not OS-level scaling), and pages
with large real data (long titles, many columns).

---

## Part 4 — Decisions and the libraries to use (research, 2026-10-19)

### Decisions (from review)

| Question | Decision | Reasoning |
|---|---|---|
| Page sizes | Tables **10 / 25 / 50 / 100**, default **25**. Card grids **12 / 24 / 48**, default **24**. Minimum **10**. API `per_page` max **100**. Notifications "Load more" step **20**. | No design system publishes a researched number; common defaults sit at 10–30 (DataTables 10, the shadcn recipe 10, GitHub API 30). For a developer tool with ~40 px rows, 25 fills about 1½ screens at 1440 × 900 and 2 screens at the 640 px minimum — enough to scan without paging every few seconds. 10 is the useful floor; 100 is the ceiling for DOM size and the API cap. 24 divides by 2, 3, 4 and 6, so grids never end on a half-empty row. |
| PR list | **Server paging now**, together with the client control (not a later phase) | One control, two modes (below). |
| Sidebar | **Auto-collapse** to the icon rail below 1200 px window width; the user's manual Ctrl/⌘+B choice wins until the width crosses the breakpoint again | |
| Keyboard | `[` / `]` prev/next page by default (rebindable, respects the single-key switch) | |
| Notifications | **"Load more"** inside the popover | A feed, not a table — NN/g lists "load more" as the alternative to infinite scroll for feeds. |

### Libraries — reuse instead of writing our own

| Need | Use | Why / notes |
|---|---|---|
| Paging state, page count, page size, column visibility, sorting for every list | **`@tanstack/react-table` v9** (9.3.1, npm `latest`; headless, ~6–7 kB for a small table) | **One engine for client and server mode**: client lists pass all rows (`createPaginatedRowModel()`); server lists set `manualPagination: true` + `rowCount` from the API — same control, same `pagination` state either way. Column visibility gives the responsive PR-table columns (M3) for free. Same family as TanStack Query, already in use. Card grids use it too (rows render as cards). The shadcn data-table recipe is built on it. |
| Pagination UI | **shadcn `pagination` primitive** (CLI) + the **shadcn data-table recipe**'s `DataTablePagination` as the starting point | Extended with numbered pages + ellipsis, the jump input and the compact container-query variants (the recipe ships only first/prev/next/last and rows-per-page `[10, 20, 25, 30, 40, 50]`; we use our own options). |
| `?page=&per=&sort=&q=` URL state | **`nuqs` 2** (2.10.2; Next ≥ 14.2, React 19) — `useQueryStates` + `parseAsInteger.withDefault()`, `clearOnDefault` | Replaces the hand-rolled `URLSearchParams` + `router.replace` code repeated on every page (PR list, Skills, Agents, PR detail). `NuqsAdapter` from `nuqs/adapters/next/app` in `app/layout.tsx`. Type-safe, batches updates, keeps defaults out of the URL. |
| Fetching pages | **TanStack Query** (installed): `placeholderData: keepPreviousData`, `isPlaceholderData` for the busy state, prefetch `page + 1` | No new dependency. |
| Responsive pieces inside panes | **Tailwind v4 container queries** (`@container`, `@md:`, `@min-[640px]:`) — built in, no plugin | Compact pager, editor tabs (M2), PR table columns (M3), Agents cards (M1). |
| Sidebar icon rail | **shadcn sidebar `collapsible="icon"`** (built in) + a ~15-line auto-collapse hook using `useSidebar().setOpen` | shadcn has no width-based auto-collapse; only the hook is ours. |
| Server paging | **Drizzle** limit/offset guide pattern: a `withPagination(qb.$dynamic(), page, perPage)` helper + **`db.$count(table, where)`** for `total`; order by the sort column **+ `id` tie-breaker** | Offset (not cursor): users need numbered pages and "jump to page N"; data is local, so OFFSET cost is negligible. Drift (a new row shifting pages) is acceptable here. |
| Files changed (129 files) — later | **`@tanstack/react-virtual`** (3.14.21) with `measureElement` for variable-height diff hunks | Out of scope for this plan; noted so nobody hand-rolls virtualization. |

Shared server pieces (no duplication across modules): one zod `PageQuery`
(`page`, `per_page` with defaults/limits) and one `paged(items, total, q)`
response builder in `server/src/modules/_shared`; the `Paged<T>` type goes to
`@devdigest/shared` through its owning package (the vendored copies are
read-only here — see root AGENTS.md).

### PR list on the server (now in scope)

- `GET /repos/:id/pulls?status=&q=&sort=&triage=&page=&per_page=` →
  `{ items, total, page, per_page, counts: { needs_review, reviewed, stale, all } }`.
- Sort, including "Highest risk", becomes an SQL `ORDER BY` (size bucket
  `CASE` on additions + deletions → blast size → score → `id`); the client's
  `compareByRisk` is deleted, so the order is defined once.
- The GitHub sync is **split from the read**: the list query only reads the
  DB; sync runs through the existing Refresh action and a throttled
  background sync (at most once per 60 s per repo, triggered when the list
  is opened), so paging never waits on GitHub.

## Implementation phases (after we agree on the design)

| Phase | Scope | Modules |
|---|---|---|
| **A** | Add `@tanstack/react-table` v9, `nuqs` 2 (+ `NuqsAdapter`), shadcn `pagination`; shared `DataPagination` control + `usePagedList` hook (TanStack Table in client or manual mode, nuqs URL state, clamping, page-size memory, keep-first-item, compact variant, a11y) with tests; `list.nextPage/prevPage` commands | client |
| **B** | Client-mode paging on L4 eval cases, L5 eval runs, L6 conventions, L7 skills | client |
| **C** | Server paging: `PageQuery` / `paged()` helpers, `Paged<T>` contract, `?page&per_page` on **PRs (server filters/sort/counts + sync split)**, Memory, CI Runs, agent runs, multi-agent runs (legacy array kept); client switches L1/L2/L3/L8/L9 to manual mode | server, client, shared |
| **D** | Notifications "Load more" | server, client |
| **E** | Min-window fixes M1–M8 (each its own commit) + a Playwright/e2e check at 1024 × 640 that fails on any horizontal page overflow | client, e2e |
| **F** (later) | Files-changed virtualization with `@tanstack/react-virtual` | client |

A and E are independent and can go first in parallel; B needs A; C needs A.

## Remaining open points

- Phase A adds dependencies (`@tanstack/react-table`, `nuqs`, shadcn
  `pagination` via the CLI). Lock files change through `pnpm install` only
  (root AGENTS.md).
- The `Paged<T>` contract belongs in `@devdigest/shared`, whose vendored
  copies are read-only in this repo — confirm where its owning source is
  edited before Phase C.

## Sources (research 2026-10-19)

- TanStack Table pagination guide and API (`manualPagination`, `rowCount`): https://tanstack.com/table/v8/docs/guide/pagination , https://tanstack.com/table/latest/docs/api/features/pagination
- TanStack Table v9 migration (features, bundle size): https://tanstack.com/table/latest/docs/framework/react/guide/migrating ; npm `@tanstack/react-table` dist-tag `latest` = 9.3.1
- shadcn data table recipe: https://ui.shadcn.com/docs/components/radix/data-table ; sidebar: https://ui.shadcn.com/docs/components/radix/sidebar
- nuqs: https://nuqs.dev/docs/installation , https://nuqs.dev/docs/parsers
- TanStack Query paginated queries: https://tanstack.com/query/v5/docs/framework/react/guides/paginated-queries
- Drizzle limit/offset and cursor guides: https://orm.drizzle.team/docs/guides/limit-offset-pagination , https://orm.drizzle.team/docs/guides/cursor-based-pagination
- NN/g on infinite scroll and alternatives: https://www.nngroup.com/videos/infinite-scrolling-when/ , https://www.nngroup.com/videos/alternatives-to-infinite-scrolling/
- Page-size heuristics: https://www.andrewcoyle.com/blog/design-better-pagination , https://getknit.dev/blog/how-to-determine-the-appropriate-page-size-for-a-paginated-api/
- `aria-current` for pagination: https://developer.mozilla.org/docs/Web/Accessibility/ARIA/Attributes/aria-current
- Tailwind v4 container queries: https://www.sitepoint.com/tailwind-css-v4-container-queries-modern-layouts/
- TanStack Virtual (dynamic sizes): https://tanstack.com/virtual/latest/docs/framework/react/examples/dynamic
