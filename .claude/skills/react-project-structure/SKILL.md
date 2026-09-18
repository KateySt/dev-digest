---
name: react-project-structure
description: "Decides where React/Next.js code is allowed to live in DevDigest's client/ — component folders, constants, helpers, hooks, shared vs colocated code. Use when adding a new component, deciding whether a constant/helper/type should be colocated or promoted to a shared location, or reviewing frontend code for structure violations — e.g. a helper duplicated across features, business logic inside a component body, or a one-off type redefined instead of imported. Trigger terms: project structure, folder structure, where does this go, colocate, shared utils, constants file, component anatomy, feature folder."
metadata:
  tags: architecture, react, nextjs, frontend, file-organization, colocation
---

## When to use

Use this skill when you:
- Add a new `_components/<Name>/` folder, page-level or nested
- Decide whether a constant, helper, hook, or type belongs inside a
  component folder, in `src/components/`, or in `src/lib/`
- Review frontend code for structure violations — a helper duplicated
  across two features instead of promoted, business logic inline in JSX,
  a type redefined instead of imported from `@devdigest/shared`

Not in scope: `server/` and `reviewer-core/` — see `onion-architecture` for
those. Not in scope either: component *quality* (purity, hook misuse,
memoization, performance, composition API design) — see "Ordering with
other skills" below for where those live.

## Ordering with other skills

Same split as `onion-architecture` uses for the backend: this skill decides
*where a piece of code is allowed to live*; the others decide *how to write
that file well* once you know where it goes.

- **`react-best-practices`** (project) — component purity, hooks misuse,
  memoization, key props, accessibility. Apply once you're inside
  `<Name>.tsx`.
- **`next-best-practices`** (project) — App Router special files
  (`page.tsx`, `layout.tsx`, `loading.tsx`), route segment conventions.
  Apply to anything under `src/app/`.
- **`vercel-react-best-practices`** (global) — performance rules
  (waterfalls, bundle size, re-renders). Apply after structure is settled.
- **`vercel-composition-patterns`** (global) — component API design
  (boolean props vs. compound components, context). Apply when designing a
  component's *props*, not its file location.
- **`onion-architecture`** (project) — this skill's counterpart for
  `server/` and `reviewer-core/`. Same "decides where code lives" role, one
  ring/layer table each, scoped to opposite halves of the repo.

## Where things live — mapped onto `client/`

| Category | Where it lives | Rule |
|---|---|---|
| Route entry | `src/app/**/page.tsx` | Thin — delegates to a colocated `_components/<Name>/`. See `next-best-practices` for the special-file conventions. |
| Feature component (used by exactly one parent) | `<parent>/_components/<Name>/` | Colocated: `<Name>.tsx` + `index.ts`, plus `constants.ts` / `helpers.ts` / `styles.ts` only as needed. See `rules/component-anatomy.md`. |
| A feature component's own sub-parts | `<Name>/_components/<Child>/` | Same shape, nested one level deeper — e.g. `AgentEditor/_components/ConfigTab/`, `RunTraceDrawer/_components/FindingsSection/`. |
| Shared UI used by 2+ features | `src/components/<kebab-name>/` | Promoted out of a feature's `_components/` the first time a *second* consumer needs it — not before. See `rules/decision-tree.md`. |
| Data-fetching / mutation logic | `src/lib/hooks/<domain>.ts` | TanStack Query hooks only (`useAgents`, `useCreateAgent`, …) — no JSX, no DOM access. This is the frontend's "service layer." |
| Cross-feature pure logic/constants | `src/lib/<name>.ts` | Promoted from a component's `helpers.ts` / `constants.ts` once 2+ features need it — e.g. `lib/findings.ts` (`sortBySeverity`, `countBySeverity` used by both the PR-list badge column and the Agent-runs timeline). |
| Shared domain types | `src/lib/types.ts` | A re-export barrel from `@devdigest/shared`, **not** a place to invent new types. Component-local types stay inline in the `.tsx` or `helpers.ts` that uses them. |
| Vendored UI primitives / shared contracts | `src/vendor/ui`, `src/vendor/shared` | Not owned here — see root `AGENTS.md` do-not-touch list. |

## Anatomy of a component folder

Every component folder in this codebase follows the same role-based file
shape — the frontend equivalent of the backend's fixed
`routes.ts`/`service.ts`/`repository.ts` naming. Read
[rules/component-anatomy.md](rules/component-anatomy.md) for the full
worked example (`AgentCard/`, `app-shell/hooks/`).

## Colocate first, extract later

Default to colocation; promote to a shared location only once a second real
consumer exists. Read [rules/decision-tree.md](rules/decision-tree.md) for
the promotion path (component → `src/components/` → `src/lib/`) with the
`lib/findings.ts` precedent, and how this applies to constants, helpers,
hooks, and types differently.

## How to use

- [rules/component-anatomy.md](rules/component-anatomy.md) — the five-file
  shape of a component folder, worked example, checklist for a new component
- [rules/decision-tree.md](rules/decision-tree.md) — colocate vs. promote,
  per code kind (constant, helper, hook, type)
- [rules/anti-patterns.md](rules/anti-patterns.md) — concrete violations to
  flag in review, phrased against this codebase

## Further reading

Full source list with annotations: `README.md` in this folder. Highlights:

- Kent C. Dodds, [State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) — the colocation principle this skill is built on
- alan2207, [bulletproof-react — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — most-cited reference architecture for production React apps
- Feature-Sliced Design, [Overview](https://feature-sliced.design/docs/get-started/overview) — layers/slices/segments methodology (referenced for the promotion-path idea, not adopted wholesale — this repo's structure is shallower than full FSD)
- React (official), [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) — why `src/lib/hooks/` is where stateful logic lives, not component bodies
- Next.js (official), [Routing: Project Organization / Colocation](https://nextjs.org/docs/14/app/building-your-application/routing/colocation) — why `_components/` is safe to colocate inside `src/app/`
