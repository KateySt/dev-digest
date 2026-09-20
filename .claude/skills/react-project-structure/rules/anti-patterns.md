# Anti-patterns to flag in review

Concrete, codebase-specific violations of `rules/decision-tree.md` and
`rules/component-anatomy.md`. Each one is phrased as "if you see X, it's a
structure violation, here's the fix" — not abstract theory.

## 1. A helper copy-pasted into a second feature instead of promoted

```ts
// BAD — src/app/repos/[repoId]/pulls/_components/PRRow/helpers.ts
export function countBySeverity(findings) { /* same body as lib/findings.ts */ }
```

If the body is the same (or near-identical) as an existing
`src/lib/<name>.ts` helper, import it — don't refork it. Compare against
the real `lib/findings.ts`, whose `countBySeverity` already serves both the
PR-list badge column and the Agent-runs timeline.

## 2. Business logic inline inside JSX instead of in `helpers.ts`

```tsx
// BAD — AgentCard.tsx
<span style={{ color: MODEL_COLOR[model] ?? "var(--text-secondary)" }}>
```

Fix: extract to `helpers.ts` as a named function (`modelColor`), same as
the real `AgentCard/helpers.ts`. This is also a `react-best-practices`
violation ("business logic in hooks/helpers, NOT in component bodies") —
the two skills agree here because the same code has both a quality problem
and a location problem.

## 3. `fetch`/`useEffect` inside a component instead of a `src/lib/hooks/` hook

```tsx
// BAD — inside AgentEditor.tsx
useEffect(() => {
  fetch(`/api/agents/${id}`).then(setAgent);
}, [id]);
```

Fix: add/use `useAgent(id)` from `src/lib/hooks/agents.ts`. Every data
fetch in this app is a TanStack Query hook in `lib/hooks/`, never a raw
`fetch` in a component — no exceptions for "just this one small call."

## 4. Redefining a type that already exists in `@devdigest/shared`

```ts
// BAD — a local reinvention inside a component's helpers.ts
interface Agent { id: string; name: string; model: string; /* drifts from the real contract */ }
```

Fix: `import type { Agent } from "@devdigest/shared"`, or re-export it
through `src/lib/types.ts` if it needs a local alias. Check `lib/types.ts`
first — it already re-exports the platform/findings/brief/knowledge/trace
contracts; a new local type is only correct if the shape genuinely doesn't
exist upstream yet.

## 5. A grab-bag `constants.ts` / `utils.ts` at the `src/lib/` root

```ts
// BAD — src/lib/constants.ts holding MODEL_COLOR, SEVERITY_ORDER, PAGE_SIZE, …
```

Fix: name the file after the domain the values belong to
(`findings.ts`, `feature-models.ts`), matching every existing file in
`src/lib/`. A file named after its *kind* (constants/utils) instead of its
*domain* is a sign nothing has actually been promoted for a real shared
reason — it's been dumped there instead.

## 6. Promoting to `src/components/` after only one use

```
src/components/agent-status-pill/   ← used by exactly one page
```

Fix: move it back to that page's `_components/agent-status-pill/`. Premature
promotion is the mirror image of anti-pattern #1 — both come from skipping
`rules/decision-tree.md`'s "promote only on the second real consumer" rule,
in opposite directions.

## 7. A component folder missing the `index.ts` barrel

```ts
// BAD — importing the file directly
import { AgentCard } from "./_components/AgentCard/AgentCard";
```

Fix: add `index.ts` (`export { AgentCard } from './AgentCard'`) and import
from the folder (`./_components/AgentCard`), matching every existing
component folder in this repo.
