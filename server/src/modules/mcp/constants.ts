/**
 * MCP module constants: tool name strings + defaults for run_agent_on_pr's
 * wait/poll behavior. Kept out of the tool files so the name strings have one
 * source of truth (used both when registering the tool and, if ever needed,
 * when tests assert on which tool a given result came from).
 */
export const TOOL_NAMES = {
  LIST_AGENTS: 'list_agents',
  RUN_AGENT_ON_PR: 'run_agent_on_pr',
  GET_FINDINGS: 'get_findings',
  GET_CONVENTIONS: 'get_conventions',
  GET_BLAST_RADIUS: 'get_blast_radius',
} as const;

/** Default time run_agent_on_pr waits for every triggered run to finish before
 *  returning `{ status: 'running', run_ids }` instead of the reviews. */
export const DEFAULT_WAIT_TIMEOUT_MS = 120_000;
