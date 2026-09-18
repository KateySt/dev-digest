# Colocate first, extract later

The rule (from Kent C. Dodds' colocation principle and bulletproof-react's
"package by feature"): **place code as close to where it's used as
possible, and move it outward only when a second real consumer needs it.**
Never promote preemptively — an unused "reusable" helper with one caller is
premature abstraction, the same anti-pattern `react-best-practices` already
flags for components.

## The promotion path

```
_components/<Name>/{constants,helpers}.ts     (1 consumer — default here)
        │  second feature needs the same thing
        ▼
src/components/<kebab-name>/{constants,helpers}.ts   (2+ consumers, still feature-shaped)
        │  logic has no JSX/DOM dependency, is genuinely cross-cutting
        ▼
src/lib/<name>.ts                              (cross-feature, pure, no component)
```

Real precedent already in this codebase — `src/lib/findings.ts`:

```ts
/** Tally a finding list by severity — the shape both the PR-list badge
    column and the Agent-runs timeline badges render (icon + count per
    severity). */
export function countBySeverity(findings: { severity: string }[]): Record<Severity, number> {
  ...
}
```

The comment records *why* it's in `src/lib/` and not colocated: two
unrelated features consume it. That comment is the model to follow —
when you promote something, say which second consumer forced the move.

## Per code kind

**Constants** — colocate in the owning component's `constants.ts`. Promote
to `src/lib/<name>.ts` only when the value itself (not just the component
using it) is shared — e.g. `SEVERITY_ORDER` in `lib/findings.ts`, used
anywhere severity needs a sort order. Don't create a grab-bag
`src/lib/constants.ts` — name the file after the domain the constants
belong to (`findings.ts`, not `constants.ts`), same as `helpers.ts` never
becomes a global `src/lib/utils.ts` dumping ground.

**Helpers** — pure functions (no hooks, no I/O) colocate with the component
that calls them. Promote when a second component needs the exact same
transform, not a similar one — a near-duplicate with different field names
usually means the two components aren't really doing the same thing yet;
inline both until the duplication is unmistakably real (2-3 occurrences).

**Hooks (stateful / data-fetching)** — never colocate a `fetch`/TanStack
Query call inside a component file. It goes straight into
`src/lib/hooks/<domain>.ts` even on first use, because data hooks are this
app's service layer and are found by domain (`agents.ts`, `reviews.ts`,
`trace.ts`), not by the one component that happens to call them first —
see `src/lib/hooks/agents.ts` (`useAgents`, `useCreateAgent`,
`useUpdateAgent`, …). A component-local *UI* hook (no I/O, e.g. a toggle
or a keyboard shortcut) follows the normal colocate-first rule instead —
inline it, or promote to a `hooks/` subfolder once 2+ files in the same
component family need it (`rules/component-anatomy.md`).

**Types** — colocate inline in the `.tsx`/`helpers.ts` that defines the
shape, until a second file needs it. Before adding *any* new shared type to
`src/lib/types.ts`, check `@devdigest/shared` first — `lib/types.ts` is a
re-export barrel, not a place to define new domain types; redefining a type
that already exists upstream is a structure violation
(`rules/anti-patterns.md` #4).

**Whole components** — same path as constants/helpers, but the folder
itself moves: `_components/<Name>/` → `src/components/<kebab-name>/`. Keep
the same five-file shape; only the parent directory changes.

## When there's no obvious promotion target

If two features need the same helper but there's no existing
`src/components/<kebab-name>/` that fits, create a new one named after the
*domain concept*, not the two components that happen to need it right now
(`diff-viewer/`, not `pr-detail-and-findings-shared/`). If the logic has no
UI dimension at all, it belongs in `src/lib/`, named after the domain
(`findings.ts`, `github-urls.ts`), following the pattern already in
`src/lib/*.ts`.
