# server/ — insights

Running log of non-obvious learnings, gotchas, and "why it's built this way"
decisions that would otherwise get lost in git history. One entry per
learning, newest first. Once something becomes obvious from the code or
README, delete the entry instead of letting it go stale.

## Format

```
### YYYY-MM-DD — short title
What happened / what we learned, and why it matters for future work here.
```

---

### 2026-09-15 — new PrMeta/PrDetail fields must be `.nullish()` unless every producer fills them

Mistake (caught by typecheck, not by review): `PrMeta` is the return type of
`GitHubClient.listPullRequests()`/`getPullRequest()` (`src/vendor/shared/adapters.ts`),
used by `octokit.ts`, `adapters/mocks.ts`'s `MockGitHubClient`, AND the offline
fallback branch inside `GET /pulls/:id` (`modules/pulls/routes.ts`, the
`catch` around the live GitHub refresh) — none of those know about
server-computed fields like `score`, `cost_usd`, or `findings` (those only
exist on the response built by `GET /repos/:id/pulls`'s `rows.map(...)`).
Adding a *required* field to `PrMeta` breaks typecheck in all of those
unrelated call sites. Make any field that's "list endpoint only, computed
from local review data" `.nullish()` on the zod schema (matching the existing
`score`/`cost_usd` precedent) rather than required, and guard reads with `??`
on the client.

### 2026-09-15 — `src/vendor/shared` has no real "owning package" to sync from

Context: root CLAUDE.md flags `server/src/vendor/shared` and
`client/src/vendor/shared` as vendored/"check the owning package before
editing." There is no such package in this repo or elsewhere — `diff`ing the
two trees shows they're byte-identical hand-maintained duplicates, and there's
no vendor-sync script anywhere (checked `scripts/`, `client/README.md`). In
practice "check the owning package" means: when you change a contract, apply
the identical edit to both `server/src/vendor/shared/...` and
`client/src/vendor/shared/...` by hand, then `diff` the two files to confirm
they still match — there's nothing to run.
