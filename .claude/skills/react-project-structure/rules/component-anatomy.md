# Anatomy of a component folder

`client/AGENTS.md` already fixes the shape:

> Component folders (`src/components/<name>/`, `_components/<Name>/`) are
> kebab-case; the React component files inside are PascalCase
> (`FindingsTooltip.tsx`), each re-exported from an `index.ts` barrel.

This skill adds the *why* and the full file set: that naming convention is
a colocation instance, and it repeats at every nesting level — a top-level
feature folder and a folder for its own sub-parts use the identical shape.

## Worked example: `src/app/agents/_components/AgentCard/`

| File | Job | Must not do |
|---|---|---|
| `AgentCard.tsx` | Component body: props, JSX, calls into `helpers.ts`/hooks | Own a computation that doesn't reference `this` component's render — that's `helpers.ts`'s job |
| `index.ts` | `export { AgentCard } from './AgentCard'` | Contain logic |
| `constants.ts` | Static literals scoped to this component only | Reference props/state/hooks; import from a sibling `_components/` folder it doesn't own |
| `helpers.ts` | Pure functions, no hooks, no I/O | Call `useX` or fetch — that belongs in `src/lib/hooks/` |
| `styles.ts` | Tailwind class-name constants, when extracted | Business logic unrelated to styling |
| `AgentCard.test.tsx` | Colocated test | — |

Real content of this folder today:

```ts
// constants.ts
export const MODEL_COLOR: Record<string, string> = {
  "gpt-4.1": "#3b82f6",
  "gpt-4o": "#10b981",
  "gpt-4o-mini": "#8b5cf6",
  o1: "#f59e0b",
};

// helpers.ts
import { MODEL_COLOR } from "./constants";

export function modelColor(model: string): string {
  return MODEL_COLOR[model] ?? "var(--text-secondary)";
}
```

`modelColor` is a pure function of its input — it has no reason to be a
hook, and no reason to live anywhere but next to the one component that
calls it.

## When a component owns more than one hook: `hooks/`

`src/components/app-shell/hooks/` shows the next size step: once a folder
needs *multiple* component-family-local hooks, they get their own `hooks/`
subfolder with a barrel, same as any other file kind:

```
app-shell/
├── AppShell.tsx
├── constants.ts
├── helpers.ts
├── index.ts
└── hooks/
    ├── index.ts              # export { useGlobalShortcuts } from './useGlobalShortcuts'; …
    ├── useGlobalShortcuts.ts
    ├── useShellCommands.ts
    └── useShellContext.ts
```

Don't create a `hooks/` folder for a single hook used by a single
component — inline it as a local `function useX()` above the component, or
give it its own top-level file only once a second file needs it (see
`rules/decision-tree.md`).

## Nesting: `_components/<Name>/_components/<Child>/`

When a feature component's own sub-parts get too large to stay inline, they
get their own folder one level deeper, same five-file shape — e.g.
`AgentEditor/_components/ConfigTab/`,
`RunTraceDrawer/_components/FindingsSection/`. A `_components/<Child>/`
folder may import from its own parent's `helpers.ts`/`constants.ts`, but
never reach *sideways* into a sibling feature's `_components/` — that's the
signal to promote to `src/components/` instead (`rules/decision-tree.md`).

## Checklist for a new component

1. Decide the level first: is this used by exactly one parent (→ nested
   `_components/<Name>/`) or already known to be shared (→
   `src/components/<kebab-name>/`)? Default to nested; you can promote
   later without a rewrite.
2. Create `<Name>.tsx` and `index.ts` only. Don't pre-create empty
   `constants.ts`/`helpers.ts`/`styles.ts` — add each only when you have
   content for it.
3. If the component needs data, call an existing hook from
   `src/lib/hooks/<domain>.ts`, or add a new one there — never `fetch`
   directly inside `<Name>.tsx`.
4. Add `<Name>.test.tsx` next to the component (see `client/AGENTS.md`).
