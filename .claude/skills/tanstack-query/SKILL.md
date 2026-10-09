---
name: tanstack-query
description: "Use when writing, reviewing, or refactoring server-state code in DevDigest's client/ with TanStack Query v5 — any useQuery/useMutation/useQueryClient call, a hook in client/src/lib/hooks/*, query keys, invalidation or setQueryData after a mutation, optimistic updates, polling a running review/eval/tour with refetchInterval, enabled/skipToken guards, error toasts for API calls, or a test that renders a component needing a QueryClient. Trigger terms: TanStack Query, React Query, useQuery, useMutation, queryKey, invalidateQueries, refetchInterval, optimistic update, QueryClient."
---

# TanStack Query v5 — DevDigest client rules

Installed: `@tanstack/react-query` **5.10x** (package.json `^5.62.8`). The app is
**client-only** — every hooks file is `"use client"`, there is no SSR prefetch /
`HydrationBoundary`. Server state lives **only** in the query cache; never mirror
it into `useState`, context, or a store.

v4 → v5 renames, deprecated methods, and longer code: [references/v5-reference.md](references/v5-reference.md).
Severity tags (for `pr-self-review` / `architecture-reviewer`): **CRITICAL** = bug
or stale/wrong UI · **HIGH** = drift, double toasts, cache inconsistency ·
**MEDIUM** = maintainability.

## Where the code goes (CRITICAL)

- Every `useQuery` / `useMutation` lives in a hook in `client/src/lib/hooks/<feature>.ts`.
  Components call the hook — never `useQuery` inline, never `api.*` inside a component.
- HTTP goes through `api.get/post/put/patch/del<T>` from `@/lib/api` (throws `ApiError`
  with `status`, `code`, `details`; status `0` = network down). Never raw `fetch`.
- A component that needs to invalidate gets an exported helper from the hooks file
  (e.g. `useInvalidateAgentEval()` in `eval-runs.ts`) — **never** a hard-coded key
  literal in a component (`PRRow.tsx` / `pulls/[number]/page.tsx` do this today; don't copy it).
- Don't pass `UseMutationResult` / `UseQueryResult` as component props — pass
  `onX`, `isPending`, data.

## Query keys (HIGH)

- Shape: `["kebab-resource", ...params]`, generic → specific. Lists vs details:
  `["agents"]` / `["agent", id]`. **Every value the queryFn reads must be in the key.**
- New code: define keys once per hooks file, as a factory with `queryOptions()` —
  it types `getQueryData`/`setQueryData` with no generics:

```ts
export const agentQueries = {
  all: () => ["agents"] as const,
  detail: (id: string) =>
    queryOptions({ queryKey: ["agent", id], queryFn: () => api.get<Agent>(`/agents/${id}`) }),
};
export const useAgent = (id: string | null) =>
  useQuery({ ...agentQueries.detail(id ?? ""), enabled: !!id });
// mutation: qc.setQueryData(agentQueries.detail(id).queryKey, saved)  // typed
```

- Touching an existing file with inline keys: reuse the exact existing key (grep the
  string first — e.g. `"eval-dashboard"` is invalidated from 3 files). Don't invent a
  near-duplicate (`"eval-dashboard-skills"` vs `"eval-skills-dashboard"`). A factory
  refactor of untouched hooks is out of scope unless asked. Mixing is fine: new keys
  get a factory, invalidations of old keys use the old literals — inside the hooks file.
- Disabled factory queries: `useQuery({ ...x.detail(id ?? ""), enabled: !!id })` is the
  house style (the `""` key never fetches). Use `skipToken` only in a standalone `useQuery`.

## Typing (HIGH)

- Type the queryFn (`api.get<Agent>(...)`), **not** the hook: no `useQuery<Agent>`,
  no `getQueryData<Agent>` when a `queryOptions` key exists.
- `ApiError` is the real error type — narrow with `err instanceof ApiError && err.status === 409`.
- Contract types come from `@devdigest/shared`; don't redeclare response interfaces.
  Endpoint with no shared type yet: declare it in the hooks file with a `TODO: move to
  @devdigest/shared` and mention it in your report — never edit `src/vendor/shared`.
- A queryFn must never resolve `undefined` (v5 rejects it) — return `null`.

## Defaults already set — don't repeat them (MEDIUM)

`providers.tsx`: `staleTime: 30_000`, `retry: 1`, `refetchOnWindowFocus: false`.
Only override per query with a reason (`provider-models` 5 min, `trace` `retry: false`,
`usePulls` refocus refetch). Writing `staleTime: 30_000` again is noise.

## Errors & toasts (HIGH)

Global handlers in `providers.tsx` already toast:
- **Queries** — only `status === 0` or `>= 500`. 4xx stay silent so the UI renders an
  inline empty state (`404 → "no tour yet"`). Render inline states from `error`, don't toast.
- **Mutations** — always toast `err.message`. **Never** add `onError: notify.error(...)`
  to a mutation → double toast. To show a purpose-written message instead, opt the
  code out: `meta: { silentCodes: ["review_in_progress"] }` and handle it locally.
- Don't nest `mutateAsync` of other mutations inside a mutation — each failing layer toasts.
- Status checks: render `data` first, then `error`, then loading — a failed background
  refetch must not blank out data already on screen.

## Mutations (CRITICAL)

Pick the cache update by what the server returns:

| Situation | Do |
|---|---|
| Response is the full updated entity | `qc.setQueryData(detailKey, saved)` **and** invalidate the list |
| Create/delete/anything affecting lists, stats, dashboards | `invalidateQueries` on every prefix whose data the server changed — copy the set from the closest existing mutation on the same resource (e.g. single eval case → cases + stats; suite run → `useInvalidateAgentEval`'s 5 keys) |
| Delete of a detail | `qc.removeQueries({ queryKey: detailKey })` + invalidate list |
| "Force refresh" GET (`?force=true`) | wrap in a mutation, `setQueryData` with the result — invalidating would refetch the cached non-forced value |
| Instant feedback, single component | optimistic via `mutation.variables` while `isPending` — no cache writes, no rollback |
| Instant feedback across components | optimistic cache write — follow `useSetContextDocuments` in `project-context.ts` |

- **Return** the invalidate promise from `onSuccess`/`onSettled` when the UI must not show
  stale data after the button stops spinning: `onSuccess: () => qc.invalidateQueries(...)`
  with an arrow that returns, or `Promise.all([...])`.
- Cache logic → `useMutation({ onSuccess })` (always runs). UI-only effects (navigate,
  close modal, local message) → `mutate(vars, { onSuccess })` (skipped if unmounted).
- Prefer `mutate` + callbacks. `mutateAsync` only with `try/catch`.
- `mutationFn` takes one argument — pass an object.
- Option order: `mutationKey, scope, mutationFn, onMutate, onSuccess, onError, onSettled`
  (`onMutate` first or inference breaks).

### Optimistic cache writes — DevDigest gotcha (CRITICAL)

`onMutate` runs a microtask **after** `mutate()` returns, so two same-tick mutations both
snapshot the pre-update cache and the second clobbers the first (`client/INSIGHTS.md`).
Required shape: write the cache **synchronously before `mutate()`**, pass `previous` in the
variables, `onMutate` only `cancelQueries`, `onError` restores `previous`, `scope: { id }`
to serialize per owner, and `onSettled` invalidates only when
`qc.isMutating({ mutationKey }) <= 1`.

## Polling (CRITICAL — specs set ceilings)

- Functional interval that stops by itself:
  `refetchInterval: (q) => (q.state.data?.status === "running" ? EVAL_POLL_MS : false)`.
  Reuse `EVAL_POLL_MS` (2000, `eval-dashboard.ts`); reviews use 4000. Never a bare
  constant interval for something that finishes.
- No polling when a run was refused/never started; respect spec caps (evals ≤ 2 s,
  onboarding tour ~150 s ceiling — see `client/specs/`).
- Reacting to "running → done" (invalidate related lists): a `useRef`(last handled id)
  + `useEffect` on `data.status` **inside the polling hook** (like `useEvalSuiteRun`) is
  the endorsed pattern — fire once per run id, also when the first poll is already
  terminal. Never copy that effect into components.
- The id returned by a "start" mutation (`runId`) is UI state — `useState` in the
  component that owns the flow is correct; the run's *data* stays in the query.

## Conditional & derived data (CRITICAL)

- Guard missing params with `enabled: !!id` (house style) or `skipToken`
  (`queryFn: id ? () => api.get(...) : skipToken`) — never `id!` in the queryFn.
  `skipToken` disables `refetch()`; use `enabled` if the caller refetches manually.
- A disabled query stays `isPending` forever → spinners use `isLoading`
  (= pending **and** fetching), not `isPending`.
- Derive in render or with `select` — never `useEffect(() => setX(data))`.
- Editable form drafts seeded from a query: mount the form only once data exists and
  reset with `key={entity.id}`, or keep `draft ?? data.field`. Not a sync effect.
- No `const { data, ...rest } = useQuery()` (breaks tracked-props render optimisation),
  and never put the whole query/mutation result in hook deps — destructure `mutate`.
- `placeholderData: keepPreviousData` for filter/range switches that shouldn't flash empty.

## Don't (deprecated / v4 — HIGH)

`cacheTime` → `gcTime` · `keepPreviousData: true` → `placeholderData: keepPreviousData` ·
`useErrorBoundary` → `throwOnError` · `status === "loading"` → `isPending` ·
`onSuccess/onError` on `useQuery` (removed) · `isInitialLoading` → `isLoading` ·
`fetchQuery/prefetchQuery/ensureQueryData` → `queryClient.query(...)` ·
`isServer` → `environmentManager.isServer()` · `isCancelledError()` → `instanceof CancelledError`.

## Tests (HIGH)

- Use `renderApp(ui)` from `@/test/eval-utils` (fresh client, `retry: false`,
  `gcTime: Infinity`, mutation `retry: false`, intl provider) + `mockFetch([...])`.
  Mock `fetch`, never `useQuery` or the hook.
- Hand-rolled client only if needed — then the same full options, created per test.
  A bare `new QueryClient()` in a test (retries → 1 s+ timeouts, flaky) is a finding.
- Await UI: `await screen.findBy…` / `waitFor(() => expect(result.current.isSuccess).toBe(true))`.
- Polling: don't wait real intervals. `vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })`,
  flip the mocked response, then `await act(async () => { vi.advanceTimersByTime(EVAL_POLL_MS) })`
  (see `EvalsTab.test.tsx`). Faking only intervals keeps RTL `findBy` working.
- `renderApp` has no global Query/MutationCache handlers, so global toasts don't fire in
  tests. Assert the inline result (error text, button state, `queryClient.getQueryState(key)?.isInvalidated`)
  — never add a local `onError` toast just to make a test observe it.

## Review checklist

1. Query/mutation lives in `lib/hooks/*`, goes through `api.*`.
2. Key includes every queryFn input; reuses existing key strings; no literal keys in components.
3. Mutation updates or invalidates **every** cache it affects; no extra `onError` toast.
4. Polling stops itself and respects the spec interval.
5. No server data copied into state; no v4/deprecated API.
6. Tests use `renderApp` or an equivalent fully-configured fresh client.
