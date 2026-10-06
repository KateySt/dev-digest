# e2e/specs — flow index

Each file is one deterministic browser journey (`agent-browser` flow), run
against the full stack (client + API + seeded DB). See `../README.md` for
how to run them. New journeys get the next number, prefixed like the rest.

| File | Journey |
|------|---------|
| `01-app-boot.flow.json` | App boots and lands on a repo's PR list |
| `02-repo-pulls-detail.flow.json` | Open a PR from the list and load its review detail |
| `03-agents.flow.json` | Agents list renders the seeded reviewer agents |
| `04-pr-findings.flow.json` | PR detail shows the seeded review run, verdict, and findings |
| `05-pr-diff.flow.json` | PR detail Files changed tab renders the seeded diff |
| `06-onboarding.flow.json` | Onboarding add-repository screen renders |
| `07-settings.flow.json` | Settings renders the API Keys and Feature Models sections |
| `08-evals.flow.json` | Turn an accepted finding into an eval case, then compare two seeded eval runs (needs the seeded Security Reviewer eval data) |
