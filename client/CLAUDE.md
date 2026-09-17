# client/ — @devdigest/web

Full picture: README.md (stack, UI route map) — read it first.

## Stack

Next.js 15 (App Router) + React 19 + TanStack Query for API data. `next-intl`
for i18n (`messages/<locale>/*.json`). UI primitives vendored under
`src/vendor/ui`, shared Zod contracts under `src/vendor/shared`.

## Commands

`pnpm dev` (:3000) · `pnpm test` (vitest + jsdom, fetch mocked) ·
`pnpm typecheck`

## Where things live

- `src/app/**/page.tsx` — routes; pages are thin, feature logic sits in
  colocated `_components/<Name>/`
- `src/lib/hooks/*` — TanStack Query hooks; `src/lib/api.ts` — fetch wrapper
  (`NEXT_PUBLIC_API_BASE`)
- `src/components/app-shell` — nav/breadcrumbs/shortcut chrome
- `src/vendor/ui`, `src/vendor/shared` — vendored, not owned here (see root
  `CLAUDE.md`)

## Non-default conventions

- Every `_components/<Name>/` colocates its own `*.test.tsx` next to the
  component.
- Tests mock `fetch` — no real API or browser needed. Real browser journeys
  live in `../e2e`, not here.

## Naming conventions

- Component folders (`src/components/<name>/`, `_components/<Name>/`) are
  kebab-case; the React component files inside are PascalCase
  (`FindingsTooltip.tsx`), each re-exported from an `index.ts` barrel.

## Gotchas

Read `INSIGHTS.md` before starting work here — treat entries as
high-confidence unless the current code contradicts them.

## Read when

- Adding a new route or page → read `docs/README.md`
- Building a new UI feature end-to-end → read `specs/README.md`
