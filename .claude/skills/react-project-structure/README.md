# React Project Structure Skill

## Motivation

DevDigest already had two React/Next.js skill layers: the global Vercel
skills (`vercel-react-best-practices` — performance, `vercel-composition-patterns`
— component API design) and the project's own `react-best-practices` /
`next-best-practices` (anti-patterns, App Router file conventions). None of
them answer *where a file goes* — component folders, constants, helpers,
hooks, business logic, shared vs. colocated code. That's a genuinely
different axis from performance or API design.

The gap mirrors the backend: `onion-architecture` explicitly decides *where
code is allowed to live* for `server/` and `reviewer-core/`, and explicitly
excludes `client/` from its scope. This skill is that skill's frontend
counterpart — same "decides where, others decide how" split, applied to
`client/`'s actual folder structure instead of an artificial one.

The rules are grounded in this codebase's real, already-consistent
conventions (`AgentCard/constants.ts` + `helpers.ts`, `lib/hooks/agents.ts`,
`lib/findings.ts`'s promotion history) rather than a structure invented from
scratch — the sources below explain *why* that existing shape is the right
one to keep enforcing.

## Sources

### Overall project structure (feature-based vs. type-based, colocation)

- [React Folder Structure Best Practices [2026] — Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/)
- [bulletproof-react — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — most-cited opinionated reference architecture for production React apps
- [bulletproof-react — README](https://github.com/alan2207/bulletproof-react)
- [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) — layers/slices/segments methodology, stack-agnostic
- [Feature-Sliced Design — documentation repo](https://github.com/feature-sliced/documentation)
- [Popular React Folder Structures and Screaming Architecture — profy.dev](https://profy.dev/article/react-folder-structure)
- [How to structure a React app in 2026 — dangz.dev](https://dangz.dev/blog/how-to-structure-a-react-app-in-2026)
- [State Colocation will make your React app faster — Kent C. Dodds](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) — canonical "place code as close to where it's used as possible" argument; the basis for `rules/decision-tree.md`
- [Application State Management with React — Kent C. Dodds](https://kentcdodds.com/blog/application-state-management-with-react)

### Next.js App Router specifics

- [Next.js — Getting Started: Project Structure (official)](https://nextjs.org/docs/app/getting-started/project-structure)
- [Next.js — Routing: Project Organization / Colocation (official)](https://nextjs.org/docs/14/app/building-your-application/routing/colocation) — private folders (`_folder`), colocation safety, why `_components` works
- Already covered in-repo: `.claude/skills/next-best-practices/file-conventions.md`

### Component splitting — when and how

- [When to Split a React Component (And When You're Over-Engineering) — dev.to](https://dev.to/137foundry/when-to-split-a-react-component-and-when-youre-over-engineering-2a6e)
- [Your React Component Isn't Too Big. It Has Too Many Reasons to Change. — dev.to](https://dev.to/bishoy_bishai/your-react-app-is-probably-doing-too-much-4a20) — "responsibility score" test: count reasons-to-change, not line count
- [7 Architectural Attributes of a Reliable React Component — Dmitri Pavlutin](https://dmitripavlutin.com/7-architectural-attributes-of-a-reliable-react-component/)
- [Single Responsibility Principle in React — cekrem.github.io](https://cekrem.github.io/posts/single-responsibility-principle-in-react/)

### Container/Presentational pattern — still relevant?

- [Container/Presentational Pattern — patterns.dev](https://www.patterns.dev/react/presentational-container-pattern/)
- [Container-presentational pattern in React – why and how to use — tsh.io](https://tsh.io/blog/container-presentational-pattern-react)
- [The Container/Presentational Pattern with React and Vue (2025) — trpkovski.com](https://www.trpkovski.com/2025/01/09/the-container-presentational-pattern-with-react-and-vue/) — consensus: pattern's *intent* survives, implementation is now hooks-based instead of class wrapper components — the reasoning behind `src/lib/hooks/` as this app's service layer

### Where business logic lives (hooks vs. services vs. utils)

- [Reusing Logic with Custom Hooks — react.dev (official)](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [Path To A Clean(er) React Architecture (Part 6) — Business Logic Separation — profy.dev](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection)
- [Why Separating Business Logic From Components Matters — Asrul Kadir](https://asrulkadir.medium.com/why-separating-business-logic-from-components-matters-in-react-applications-5dbe2c71a2ba)
- [Separation of concerns with React hooks — Felix Gerschau](https://felixgerschau.substack.com/p/separation-of-concerns-with-react)
- [Part 3: Clean Architecture in React — dev.to](https://dev.to/swymn/part-3-clean-architecture-in-react-4b49)
- [React Custom Hooks vs. Helper Functions — When to Use Both — Medium](https://medium.com/@priyankadaida/react-custom-hooks-vs-helper-functions-when-to-use-both-e40167325479) — rule of thumb behind `rules/decision-tree.md`'s per-kind table: hooks = stateful/lifecycle-bound, helpers = pure/stateless, services (`lib/hooks/`) = external I/O

### Where constants live

- [How to Add a Constants File to Your React Project — Medium](https://medium.com/@austinpaley32/how-to-add-a-constants-file-to-your-react-project-6ce31c015774)
- [Best Practices for Creating and Using Constant Files in React — DevGex](https://devgex.com/en/article/00046806)
- [How to Improve Your ReactJS Code with Constants — Bomberbot](https://www.bomberbot.com/reactjs/how-to-improve-your-reactjs-code-with-constants-an-expert-guide/) — consensus (feature-scoped constants colocated, only cross-feature constants promoted) matches this repo's real `AgentCard/constants.ts` vs. `lib/findings.ts` split

### Where TypeScript types live

- [How to Organize Types in a React Project — Wisp CMS](https://www.wisp.blog/blog/how-to-organize-types-in-a-react-project)
- [How Should I Organize My Types as a React Developer? — Wisp CMS](https://www.wisp.blog/blog/how-should-i-organize-my-types-as-a-react-developer)
- [Where Your Types Live Matters More Than You Think — Serghei's Blog](https://blog.serghei.pl/posts/where-your-types-live-matters/) — hybrid consensus (colocate component-specific types, central folder for shared/domain types) matches `lib/types.ts`'s role as a re-export barrel from `@devdigest/shared`

### Internal baseline (this repo's existing conventions, checked before writing any rule above)

- `client/AGENTS.md` — pages thin, feature logic in colocated `_components/<Name>/`; hooks in `src/lib/hooks/*`; kebab-case folders, PascalCase component files, `index.ts` barrel re-export
- `.claude/skills/react-best-practices/SKILL.md` §"Code Organization" — already states colocation + "shared utilities go in `utils/` or `components/ui/`" at a high level; this skill goes deeper, doesn't restate
- `.claude/skills/next-best-practices/file-conventions.md` — App Router file conventions, private folders
- `.claude/skills/onion-architecture/SKILL.md` — the structural model this skill's "Ordering with other skills" section and rule-file split are copied from
