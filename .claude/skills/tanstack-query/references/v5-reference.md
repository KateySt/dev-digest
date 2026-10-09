# TanStack Query v5 — reference

Checked against installed `@tanstack/query-core` 5.102.8 typings and upstream
docs (October 2026; latest npm 5.104.x). Read this when a rule in `SKILL.md`
needs the full API shape.

## v4 → v5 (don't write the left column)

| v4 / deprecated | v5 |
|---|---|
| `useQuery(key, fn, opts)` | `useQuery({ queryKey, queryFn, ...opts })` — object signature only |
| `cacheTime` | `gcTime` |
| `keepPreviousData: true`, `isPreviousData` | `placeholderData: keepPreviousData`, `isPlaceholderData` |
| `useErrorBoundary` | `throwOnError` (bool or `(err, query) => bool`) |
| `status === "loading"`, mutation `isLoading` | `isPending` (`isLoading` = `isPending && isFetching`) |
| `onSuccess/onError/onSettled` on `useQuery` | removed — use `QueryCache` callbacks or derive in render |
| `suspense: true` | `useSuspenseQuery` / `useSuspenseInfiniteQuery` / `useSuspenseQueries` |
| `Hydrate` | `HydrationBoundary` |
| `useInfiniteQuery` without start page | `initialPageParam` required; optional `maxPages` |
| `isInitialLoading` | `isLoading` |
| `queryClient.fetchQuery(o)` | `queryClient.query(o)` |
| `prefetchQuery(o)` | `queryClient.query(o).catch(noop)` |
| `ensureQueryData(o)` | `queryClient.query({ ...o, staleTime: "static" })` |
| `fetch/prefetch/ensureInfiniteQueryData` | `queryClient.infiniteQuery(...)` (same patterns) |
| `isServer` | `environmentManager.isServer()` |
| `isCancelledError(e)` | `e instanceof CancelledError` |
| default `TError = unknown` | `Error`; override globally via `Register` |

`staleTime: "static"` = never stale, even on `invalidateQueries`; `Infinity` can
still be invalidated.

## Mutation callback signature (5.80+)

```ts
useMutation({
  mutationKey: ["todo-add"],
  mutationFn: (vars: NewTodo, ctx) => api.post<Todo>("/todos", vars), // ctx = { client, meta, mutationKey }
  onMutate: async (vars, ctx) => {             // returns "onMutateResult" (formerly "context")
    await ctx.client.cancelQueries({ queryKey: ["todos"] });
    return { previous: ctx.client.getQueryData(todoQueries.list().queryKey) };
  },
  onError: (_err, _vars, onMutateResult, ctx) =>
    ctx.client.setQueryData(todoQueries.list().queryKey, onMutateResult?.previous),
  onSettled: (_data, _err, _vars, _r, ctx) =>
    ctx.client.invalidateQueries({ queryKey: ["todos"] }),
});
```

In DevDigest, prefer the synchronous pre-`mutate()` write instead of `onMutate`
snapshots for anything the user can trigger twice quickly (see `SKILL.md`).

## Optimistic UI via variables (no cache writes)

```tsx
const add = useAddTodo();
{add.isPending && <Row dim>{add.variables.title}</Row>}
// another component:
const pending = useMutationState({
  filters: { mutationKey: ["todo-add"], status: "pending" },
  select: (m) => m.state.variables as NewTodo,
});
```

## Global invalidation via meta (optional pattern)

```ts
declare module "@tanstack/react-query" {
  interface Register { mutationMeta: { invalidates?: QueryKey[]; silentCodes?: string[] } }
}
new MutationCache({
  onSuccess: (_d, _v, _r, mutation) =>
    queryClient.invalidateQueries({
      predicate: (q) => mutation.meta?.invalidates?.some((k) => matchQuery({ queryKey: k }, q)) ?? false,
    }),
});
```

DevDigest currently reads `meta.silentCodes` untyped (`as string[]`); typing it via
`Register` is the clean upgrade.

## Error boundaries

```ts
useQuery({ ...opts, throwOnError: (err) => err instanceof ApiError && err.status >= 500 });
// reset: QueryErrorResetBoundary / useQueryErrorResetBoundary, or Next error.tsx reset()
```

## Next.js App Router SSR (not used today — only if SSR prefetch is introduced)

- Provider: server → new `QueryClient` per request; browser → module singleton.
  `useState(() => new QueryClient())` is only safe without a Suspense boundary
  above suspending children — revisit `providers.tsx` before adding `useSuspenseQuery`.
- Default `staleTime > 0` so the client doesn't refetch right after hydration.
- Server Component: `await qc.query(opts).catch(noop)` (or don't await to stream,
  with `dehydrate.shouldDehydrateQuery: q => defaultShouldDehydrateQuery(q) || q.state.status === "pending"`),
  then `<HydrationBoundary state={dehydrate(qc)}>`; client reads the same `queryOptions`.
- Don't render the same server data in an RSC and a client query — they drift.

## eslint-plugin-query (not configured in client/ yet)

`@tanstack/eslint-plugin-query` `flat/recommended`: `exhaustive-deps`,
`no-rest-destructuring`, `stable-query-client`, `no-unstable-deps`,
`infinite-query-property-order`, `mutation-property-order`, `no-void-query-fn`.
`recommended-strict` adds `prefer-query-options`. The SKILL.md rules mirror these
by hand.

## Sources

- https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5
- https://tanstack.com/query/latest/docs/framework/react/guides/query-options
- https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates
- https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
- https://tanstack.com/query/latest/docs/framework/react/guides/testing
- https://tanstack.com/query/latest/docs/eslint/eslint-plugin-query
- https://tkdodo.eu/blog/the-query-options-api
- https://tkdodo.eu/blog/effective-react-query-keys
- https://tkdodo.eu/blog/mastering-mutations-in-react-query
- https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query
- https://tkdodo.eu/blog/automatic-query-invalidation-after-mutations
- https://tkdodo.eu/blog/react-query-error-handling
- https://tkdodo.eu/blog/status-checks-in-react-query
- https://tkdodo.eu/blog/dont-over-use-state
