# Workflow retro: Eval Dashboard "Run all" fix (2026-10-05)

## Summary
This was not a multi-agent workflow. The assistant worked alone and spawned no subagents. There were no Agent or SendMessage calls, so there is no per-agent breakdown to give.

## Agents
- Agents run: 0 (the main assistant only).
- Order: not applicable.
- Round-trips per agent: not applicable.

## Token spend
The transcript has no token counts. I can't report real numbers, and I haven't estimated any. Qualitatively, spend was very low. It was one Grep, one Read, one Edit and one test run, followed by a short answer.

## Flow
1. The user reported that "Run all" stays disabled after a run finishes.
2. Grep for "run-all" in client/src.
3. Read `client/src/features/eval-dashboard/RunAllButton.tsx`.
4. Edit: `isRunning` is now reset in a `finally` block. Before, it was only cleared on success.
5. `pnpm test` in client/ passed 41 tests.
6. The assistant explained the root cause. The user said thanks and ran /workflow-retro.

## Friction
- None observed. The fix took one round-trip, there was no duplicated work, and the assistant asked the user no questions.
- Gaps, noted for completeness and not as failures:
  - No regression test was added for the failed-run path. The 41 existing tests passed before and after, so they probably never covered this bug.
  - Typecheck was not run, only tests.
  - The assistant did not confirm the fix in a browser. The transcript shows nothing about checking the failure scenario by hand.

## User question load
The user asked 0 clarifying questions and received none. They sent 1 request and 1 acknowledgement.

## Recommendations
- Don't use a multi-agent pipeline (spec-creator, planner, implementer and so on) for a fix like this. The single-agent pass was the right size.
- Add a small test that makes the run reject and asserts the button re-enables. It is cheap and locks in the fix.
- Run `pnpm typecheck` alongside tests as the module's standard check.
- Skim sibling components for the same pattern of resetting state only on success.
- For workflow-retro itself: when a session has no agents, give a short "no multi-agent workflow" report like this one instead of inventing agent metrics.
