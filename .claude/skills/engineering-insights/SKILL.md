---
name: engineering-insights
description: Captures non-obvious engineering learnings — patterns that worked, dead ends, gotchas, and "why it's built this way" decisions — into the INSIGHTS.md of the module where the work happened. Use at the end of a substantial work session (30+ minutes, hit a real problem/fix/discovery), the moment something surprising turns up mid-task, or when the user runs /engineering-insights.
---

# Engineering Insights

## When to write

- End of a session that hit a real problem, fix, or discovery. Skip trivial
  edits, typos, and anything that didn't teach you something.
- Mid-task, the moment something surprising or non-obvious turns up — don't
  wait for a wrap-up to lose it.
- On `/engineering-insights`, review the whole session and catch anything
  missed.

## Where to write

Route to the module the finding is actually about — write to *that* module's
`INSIGHTS.md`, never a root-level file:

`server/INSIGHTS.md` · `client/INSIGHTS.md` · `reviewer-core/INSIGHTS.md` ·
`e2e/INSIGHTS.md`

If a finding spans more than one module, add an entry to each affected file.

## Quality bar

Cold-read test: if an agent with zero memory of this session couldn't read
the entry and know exactly what to do or avoid, don't write it.

- Bad: "Promises can be tricky."
- Good: "`Promise.all()` on the ingest pipeline times out past 30 items — use
  `Promise.allSettled()` batched by 10 instead."

If it's already obvious from reading the code or the README, it's noise, not
a learning — don't write it.

## How to write

Follow each file's existing format exactly. Append only — newest entry first,
never rewrite or delete someone else's entry (correct it with a new dated
entry instead):

```
### YYYY-MM-DD — short title
[Pattern|Mistake|Decision|Context] one paragraph: what happened, why it
matters for whoever works here next.
```

The category tag is a one-word hint for scanning, not a separate section.
Entries go stale — if the code has since made one obvious, delete it per the
file's own header rule rather than leaving dead weight.
