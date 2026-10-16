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
| `09-skill-evals.flow.json` | Create a skill eval case, then open the per-skill dashboard and compare the seeded v1 / v2 skill runs (deltas + skill-text diff; needs migration 0021 and the seeded `pr-quality-rubric` skill) |
| `10-memory.flow.json` | Learn from the seeded Security Reviewer finding, save it, follow the "Learned" link to the Memory page (needs migrations 0026–0027; fresh DB with no memories) |
| `11-memory-curation.flow.json` | Make two duplicate memories, click Curate, edit the merged text and apply the one merge; the other memory is archived with "Merged into" (needs migration 0028; runs after `10-memory`, whose memory it reuses) |
| `12-convention-skills.flow.json` | Accept the three seeded convention candidates, build a project skill from two of them and a global skill from the third; statuses never change (needs migration 0029 and the seeded candidates) |
