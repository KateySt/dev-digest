# client/ — insights

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

### 2026-09-30 — `client/src/vendor/shared` and `server/src/vendor/shared` are NOT byte-identical — diff only the file(s) you touch

The 2026-09-15 entry below (and `server/INSIGHTS.md`'s equivalent) describes
the two `vendor/shared` trees as "confirmed byte-identical" and says to
"diff the two files to confirm they still match" after a hand-applied edit
— that was true when written, isn't anymore. While building the Onboarding
Tour feature (SPEC-06), `diff -rq` between the two trees found 5
pre-existing differing files, unrelated to this feature: `adapters.ts`,
`contracts/eval-ci.ts`, `contracts/knowledge.ts`, `contracts/platform.ts`,
`contracts/productionize.ts` — e.g. this side's `contracts/knowledge.ts` is
missing the `AgentVersionConfig`/`AgentVersion` exports the server side has.
No CI check enforces parity between the two trees, so this kind of drift
accumulates silently.

Practical effect: **a whole-tree diff between the two `vendor/shared`
directories is no longer a usable check** — it'll show noise from these 5
files no matter what you touched. Keep hand-applying identical edits to
both trees (still correct), but scope the "diff to confirm" step to
**only the specific file(s) you edited**, not the whole tree.

---

### 2026-09-24 — none of the seeded PRs have `endpoints_affected`/`crons_affected` data, so the Blast Radius panel's endpoint/cron chip styling can't be visually confirmed live

Context, found while doing visual QA on the Blast Radius panel's endpoint
(blue outline)/cron (orange outline) chip differentiation (`BlastTree.tsx`):
`curl http://localhost:3001/pulls/<id>/blast` for every seeded PR (checked
all 6) returns `"endpoints_affected":[]` and `"crons_affected":[]` on every
`downstream` entry, for every PR — not just PR #5. So the live app can never
render an endpoint or cron chip against current seed data, regardless of
which PR you open; this isn't specific to one PR being the "wrong" one to
check. Confirmed the *code path* is correct via `BlastRadiusPanel.test.tsx`
(mocked data with `endpoints_affected: ["POST /checkout"]` /
`crons_affected: ["nightly-reconcile"]`) instead. If a future task needs to
visually verify this rendering path, seed a PR's blast-radius fixture with
non-empty `endpoints_affected`/`crons_affected` first (check
`server/` seed scripts) — don't assume any existing seeded PR has it.

### 2026-09-24 — an unbreakable mono `file:line` string overflows its box unless you explicitly give it somewhere to break

Mistake, caught by the user three separate times in one session (`BlastTree`
caller rows, `IntentPanel`'s low-confidence `Badge`, `RiskAreasList`'s card
ref and detail refs) before the pattern was recognized and generalized.

A `file:line` (or `file:line — name`) string has no spaces, so the browser
treats it as one unbreakable "word". Neither `Badge`'s hardcoded
`white-space: nowrap` (vendor/ui, fine for short pill labels like
"CRITICAL", wrong for a full sentence) nor a plain flex child's default
`min-width: auto` will let it wrap — it just runs past the container edge
instead, often past the actual page edge since these panels sit in a
`grid-template-columns: 1fr 1fr` (see the `OverviewTab` fix below). Adding
`text-overflow: ellipsis` alone does nothing here either: ellipsis only
truncates on overflow, it doesn't create a wrap opportunity, and a `1fr`
grid track's minimum width is its content's max-content size — so the
"ellipsis" box just grows the whole column instead of clipping.

Fix, applied per call site (three so far): give the text's own box
`overflowWrap: "anywhere"` + `wordBreak: "break-word"` + `minWidth: 0`. For a
`display: flex` **row** where items wrap between each other (`RiskAreasList`'s
`detailRefs`), each individual item still needs its own wrap room — wrap it
in a small `<div style={...}>` around the `MonoLink`, don't rely on the
row's own `flexWrap: "wrap"` (that only wraps *between* items, not *within*
one long one). For the surrounding CSS Grid (`OverviewTab`'s two-column
layout), a bare `1fr` track also needs to become `minmax(0, 1fr)` or the
track itself expands to the unbroken content's width before any child-level
fix gets a chance to apply.

**Not fixed at the primitive level.** `MonoLink`/the `.mono` class are used
elsewhere (diff viewer, code snippets) where `nowrap` + horizontal scroll is
the *correct* behavior, so this was intentionally left as a per-usage
override via `Badge`'s existing `style` prop / a wrapping `div`, not a
vendor/ui change. If a fourth call site needs this, consider a named
opt-in variant (e.g. `<MonoLink wrap>`) instead of a fifth copy-paste.

Decision, caught by the user comparing the live app to the design mockups:
`RunHistory`'s findings-count `FindingsTooltip` trigger initially reused this
codebase's existing plain-text pattern (`t("runStatus.findings", { count })`
→ "3 finding(s)"), which was already there before the tooltip existed. The
target design instead shows a compact per-severity icon+count badge cluster
(red circle = CRITICAL, orange triangle = WARNING, blue lightbulb =
SUGGESTION) — the exact same cluster the Pull Requests list's FINDINGS column
uses — on *every* screen that surfaces a findings count, not just the list.
Extracted the cluster into `components/findings-tooltip/SeverityCountBadges`
(fed by `countBySeverity()` in `lib/findings.ts`) so `PRRow` and `RunHistory`
render identically instead of one using badges and the other plain text.
Lesson: when a feature spec shows the same affordance on two screens, check
that *all* of it (not just the interactive/hover part) matches pixel-for-
pixel — it's easy to wire the hard part (data, hover, links) correctly while
leaving a stale, pre-existing display convention untouched right next to it.

### 2026-09-15 — a hover-trigger's "disabled" check must distinguish "not yet resolved" from "confirmed empty"

Mistake: `FindingsTooltip`'s `disabled` prop (passed to `HoverPopover` to skip
rendering a dead hover target when a PR/run has zero findings) was computed as
`!loading && sortBySeverity(findings ?? []).length === 0`. For data that's
fetched *lazily on hover* (the PR list's findings badge — see
`PRRow.tsx`'s `usePrReviews(hasHoveredFindings ? pr.id : null)`), `findings`
starts as `undefined` before the first hover, `loading` is also `false` at
that point (nothing has started fetching yet) — so this expression evaluates
to `disabled: true` on the very first render. Since `HoverPopover` skips
*all* its hover-listener wiring when `disabled`, the trigger could never
receive the `mouseenter` that was supposed to kick off `hasHoveredFindings =
true` in the first place — a permanent deadlock, confirmed live (no
`aria-expanded` attribute anywhere in the DOM; the tooltip simply never
opened, no error, no warning). Caught by opening the real app in a browser via
`agent-browser`, not by the component's own unit tests — those mocked
`usePrReviews` to a static return and never asserted that hovering actually
opens anything. Fix: only disable once you've *positively confirmed* zero
findings — `!loading && findings !== undefined && findings.length === 0`.
When a hover trigger's content depends on lazy data, treat "no data object
yet" and "loaded, and it's empty" as different states; collapsing them via
`?? []` for convenience silently breaks the case that hasn't loaded yet.

### 2026-09-15 — don't call a prop callback from inside a `setState` functional updater

Mistake, found via a live React warning ("Cannot update a component while
rendering a different component") during the fix above: `HoverPopover`'s
`openNow` called `onOpenChange?.(true)` *inside* `setOpen((was) => { if
(!was) onOpenChange?.(true); return true; })` — using the updater's `was`
param to fire the callback only on a real open transition, to avoid needing
`open` in `useCallback`'s deps (which would recreate the handler, and thus
detach/reattach the DOM listener, on every open/close). React treats a
`setState` updater as part of the render calculation; calling a callback
that itself calls a *different* component's `setState` from inside it trips
the "setState in render" heuristic — harmless-looking in this case (React
still applied the update) but a real anti-pattern. Fix: track "is currently
open" in a plain `useRef` instead of reading it off the updater's previous-
state param, and call `onOpenChange` directly in the event-handler body (not
inside `setOpen(...)`) gated on the ref. Keeps the handler stable across
renders without piggybacking side effects on a state updater.

### 2026-09-15 — `src/vendor/ui` and `src/vendor/shared` are hand-maintained, not synced from anywhere

Context: root CLAUDE.md marks `client/src/vendor/ui` and `*/src/vendor/shared`
"do-not-touch — check the owning package before editing," which reads like
there's a separate source-of-truth repo. There isn't one in this codebase —
no sync script exists (checked `scripts/`, `client/README.md`), and
`src/vendor/shared` on both sides of the tree are confirmed byte-identical
hand-duplicated files. Adding a genuinely new, additive primitive (e.g. a
`HoverPopover` alongside the existing hand-rolled `Dropdown`/`MonoLink`) is
safe — just match the existing style (inline `style` objects, `var(--token)`
CSS custom properties, no new npm dependency) and export it from the
directory's `index.ts` barrel like everything else there.

### 2026-09-15 — editing a barrel `index.ts` with a narrow `old_string` can silently drop unrelated exports

Mistake: an `Edit` on `src/vendor/ui/primitives/index.ts` targeting one
export line (`export { MonoLink } from "./MonoLink";` → itself + a new
export) replaced the *entire file* down to just the new lines, silently
breaking every other primitive's export (`SeverityBadge`, `CategoryTag`,
`Skeleton`, etc. all became `undefined` at import sites — surfaced as "Element
type is invalid... got: undefined" in an unrelated component's test, not in
the file that was actually edited). Cause not fully isolated. After editing
any barrel/re-export file, `git diff` it immediately to confirm only the
intended lines changed before moving on — the failure shows up far from the
edit site and wastes time to trace back.
