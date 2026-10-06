# Eval

Spec ID: SPEC-02
Status: implemented
Supersedes: none

An eval case (`eval_cases`) is a hand-authored regression fixture: a diff +
optional PR title/body (`input_meta`) + a list of findings you expect a
review to surface (`expected_output`). Running it replays a real
`reviewPullRequest()` call against the case's owning agent and scores the
result — it's the mechanism behind the product's "controlled experiment"
story (an agent with/without a skill should recall a known finding
differently).

## Two distinct "run" actions — do not conflate them

- **Single case** (`POST /eval-cases/:id/run`, from the Evals tab's per-case
  "Run" or the case editor's "Run case") — runs ONE case, persists ONE
  `eval_runs` row, returns `EvalCaseRun`.
- **Batch** (`POST /eval-dashboard/run-all`, the global Eval Dashboard's "Run
  eval (N)") — runs EVERY case in the workspace sequentially (not parallel —
  keeps LLM cost/rate predictable), each still persisting its own ordinary
  `eval_runs` row, and returns `EvalRun` — an in-memory aggregate
  (`per_trace[]`, `traces_passed`/`traces_total`, averaged
  recall/precision/citation, summed duration/cost) built from that batch's
  results. There is no "batch" table; nothing marks which `eval_runs` rows
  belong to the same "Run eval (N)" click — the dashboard's trend/recent-runs
  just reads the flat `eval_runs` history chronologically.

## Scoring

`recall`/`precision` come from `reviewer-core`'s `scoreEvalCase` (pure,
no I/O): greedy one-to-one matching between `expected_output` and the run's
grounded findings, keyed on `file` + `severity` + line-range overlap.
`citation_accuracy` needs no matching — it's
`kept.length / (kept.length + dropped.length)` from the SAME
`reviewPullRequest` call's grounding gate, i.e. "of everything the model
claimed, how much cited a real diff line." `pass` = `recall === 1 && precision
=== 1` (an exact set match); `citation_accuracy` doesn't affect `pass`.

## Only `owner_kind: 'agent'` cases can be run

`eval_cases.owner_kind` is `'skill' | 'agent'` in the schema, but `runCase`
resolves the owner via `agentsRepo.getById` and throws if the case isn't
agent-owned. Every case created through the Evals tab is agent-owned; running
a skill-owned case would need a "baseline agent + this skill" concept that
doesn't exist yet.
