# CI

"Publish to CI" commits a GitHub Actions workflow + a portable agent config
to a target repo and opens a pull request — via `GitHubClient` (`server/src/
vendor/shared/adapters.ts`), not a bespoke Octokit call.

## Publish and re-publish are the same action

There's no separate "update" code path. `GitHubClient.commitFiles` is
documented as idempotent (creates the branch from `base` if missing, else
fast-forwards it) and `findOpenPr` exists specifically so a second publish
reuses the branch's already-open PR instead of opening a duplicate one.
`CiService.publish` always: commit → `findOpenPr` → reuse or
`openPullRequest` → upsert `ci_installations`. The client picks between
"Publish to CI" and "Update CI" purely by whether an installation row
already exists — same server call either way.

## The committed config has resolved skill bodies, not ids

`buildAgentConfig` (`modules/ci/helpers.ts`) is NOT `AgentVersionConfig` —
that contract stores skill **ids** for this app's own version history, which
only means something with DB access. The committed `.devdigest/<slug>.json`
is read by a *standalone* CI runner (not built yet) with no DB — so its
`skills` field is the resolved body text, the same shape `reviewPullRequest`'s
own `skills` input already expects. Resolution reuses
`agentsRepo.linkedSkills()` filtered to `enabled`, same as `run-executor.ts`.

## No CI runner exists — `ci_runs` will be empty

The workflow this feature commits references `npx devdigest review --pr`,
but no such CLI/action is published anywhere in this repo yet. Writing a
`ci_runs` row is that (separate, unbuilt) runner's job — it would call
`reviewPullRequest` the same way `run-executor.ts` does, then post results
and write a row here. `GET /ci-runs` is fully built (filters, joins) but has
nothing to return until the runner exists. This is expected, not a bug —
don't seed fake rows to paper over it.

## Testing touches only `MockGitHubClient`

`server/src/adapters/mocks.ts`'s `MockGitHubClient` tracks `committed`/
`openedPrs` arrays specifically for asserting this flow. Every test for this
module — including the idempotent-re-publish regression test — runs against
the mock. The real `OctokitGitHubClient` opens a real PR on a real repo;
never point it at anything in an automated test.
