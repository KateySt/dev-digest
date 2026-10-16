# e2e/ — insights

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

### 2026-10-16 — Locators that silently stop matching

- `wait --text` matches `innerText`, which applies CSS `text-transform`:
  headings styled uppercase must be waited for in capitals
  (`"SOURCE CONTEXTS"`, `"RECENT EVAL RUNS · ALL SKILLS"`).
- `find text X --exact` does not hit a tab button whose label sits next to an
  icon. `find role button click --name X --exact` does.
- `find nth 0 "button:has-text('…')"` is not supported (Playwright-only
  pseudo-class). Use `find role button click --name …`, which takes the first
  match in DOM order.
- PR run accordion headers show severity chips, not "N findings". Click a header
  by its accessible name, e.g. `--name "Security Reviewer request changes"`.
- `find … click` does not wait for a button to become enabled. Clicking a
  disabled button is a silent no-op, so the failure shows up one step later.
  Gate such clicks with `wait --fn` on `!button.disabled` (flow 08's
  "Turn into eval case" is disabled until the agent's linked skills load).
- Clicks use the element's coordinates. A click made while a drawer is still
  sliding in (`ddslidein`, 0.2 s) can land where the button was a moment ago.
  After the drawer's content appears, wait for finite animations to finish
  (`wait --fn "document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity)"`).
- When you drive agent-browser by hand from Git Bash, set `MSYS_NO_PATHCONV=1`.
  Otherwise MSYS rewrites `wait --url /pulls` into a Windows path and the wait
  times out. The runner (`execFile`) is not affected.
