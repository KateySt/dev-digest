import type { AgentRow } from '../../db/rows.js';

/**
 * Pure helpers for the ci module — file-name slugging and the two files
 * "Publish to CI" commits. No I/O (the service does the actual git/GitHub
 * calls); kept separate so the generated content is unit-testable without a
 * mocked adapter.
 */

/** Filesystem/branch-safe slug for an agent name, e.g. "Security Reviewer"
 *  → "security-reviewer". */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'agent'
  );
}

/** Env var name for a provider's API key — matches the names
 *  `SecretsProvider`/`container.ts` already use for local secrets. */
const PROVIDER_SECRET_KEY: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

export function providerSecretKey(provider: string): string {
  return PROVIDER_SECRET_KEY[provider] ?? 'OPENAI_API_KEY';
}

/**
 * A GitHub Actions workflow that reviews every PR with this agent. There is
 * no published `devdigest` CLI/action yet (the CI runner is a separate,
 * unbuilt lesson) — this is well-formed scaffolding for that future runner,
 * matching the CLI shape already documented in `exportWizard.targets.cliDesc`
 * ("devdigest review --pr"), not a lie about current capability.
 */
export function buildWorkflowYaml(agentSlug: string, provider: string): string {
  const secretKey = providerSecretKey(provider);
  return `name: DevDigest Review (${agentSlug})
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run DevDigest review
        run: npx devdigest review --pr \${{ github.event.pull_request.number }}
        env:
          DEVDIGEST_AGENT_CONFIG: .devdigest/${agentSlug}.json
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          ${secretKey}: \${{ secrets.${secretKey} }}
`;
}

/** A portable snapshot of the agent's config, for a CI runner with no DB
 *  access. Deliberately NOT `AgentVersionConfig` (which stores skill ids for
 *  this app's own version history) — skills are resolved BODIES here, the
 *  same shape `reviewPullRequest`'s `skills` input already expects. */
export function buildAgentConfig(agent: AgentRow, skillBodies: string[]): string {
  const config = {
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.systemPrompt,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
    skills: skillBodies,
  };
  return JSON.stringify(config, null, 2) + '\n';
}
