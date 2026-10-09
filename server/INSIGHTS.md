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

### 2026-10-07 — Skill evals (SPEC-08): three gotchas worth knowing

- **Service-level transaction is an accepted exception.** `SkillsService.delete`
  runs one `db.transaction` deleting the skill and its eval cases
  (`container.evalRepo.deleteCasesForOwner`); runs cascade via FK. It is the
  first transaction opened in a service rather than a repository; the
  architecture review accepted it because the two repos must commit atomically.
  Don't copy the pattern casually.
- **Fastify delivers a missing body as `null`**, so an optional body such as
  `POST /skills/:id/eval-runs` (`{ draft_body? }`) and the `target` of
  `POST /findings/:id/eval-case` needs a `.nullish()` body schema, not
  `.optional()`, or a bodyless call returns 400.
- **Run integration tests with `--no-file-parallelism`.** Parallel
  testcontainers Postgres starts hit the docker-check timeout and the files
  fail spuriously.

---

### 2026-09-30 — `server/src/vendor/shared` and `client/src/vendor/shared` are NOT byte-identical — diff only the file(s) you touch

Both this file's 2026-09-15 entry and `client/INSIGHTS.md`'s equivalent entry
describe the two `vendor/shared` trees as "confirmed byte-identical" and
instruct "diff the two files to confirm they still match" — true when that
entry was written, no longer true. While building the Onboarding Tour
feature (SPEC-06), `diff -rq` between the two trees turned up 5
pre-existing differing files, unrelated to this feature:
`adapters.ts`, `contracts/eval-ci.ts`, `contracts/knowledge.ts`,
`contracts/platform.ts`, `contracts/productionize.ts`. Some of this drift is
substantial (`client`'s `contracts/knowledge.ts` is missing the
`AgentVersionConfig`/`AgentVersion` exports `server`'s copy has, and several
comments have independently diverged), so this isn't recent — it's been
accumulating silently since there's no CI check enforcing parity.

Practical effect: **a whole-tree `diff -rq server/src/vendor/shared
client/src/vendor/shared` is not a usable pre-existing-drift check anymore**
— it will always show noise from these 5 files regardless of what you
touched. When you edit a shared contract, apply the identical edit to both
trees by hand (still correct — see the 2026-09-15 entry below), then diff
**only the specific file(s) you touched** to confirm those two match, not
the whole tree.

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
