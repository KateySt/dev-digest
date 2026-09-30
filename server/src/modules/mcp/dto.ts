import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Agent, ConventionCandidate } from '@devdigest/shared';
import type { ReviewDto, ReviewDtoFinding } from '../reviews/helpers.js';
import { AppError } from '../../platform/errors.js';

/**
 * Shared output-trimming + result-shaping helpers for the MCP tool handlers.
 * Every tool's DB/service rows carry more than an MCP client needs (agent
 * system_prompt/output_schema, full RunTrace event logs, …) — these strip
 * each shape down to the exact fields the tool contracts promise, so no
 * handler hand-rolls its own JSON-shaping.
 */

// ---------------------------------------------------------------------------
// Agents (list_agents)
// ---------------------------------------------------------------------------

export interface McpAgentSummary {
  id: string;
  name: string;
  provider: string;
  model: string;
  enabled: boolean;
}

/** Omits system_prompt/output_schema — large and irrelevant to an MCP client. */
export function trimAgent(agent: Agent): McpAgentSummary {
  return {
    id: agent.id,
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    enabled: agent.enabled,
  };
}

// ---------------------------------------------------------------------------
// Findings + reviews (run_agent_on_pr, get_findings)
// ---------------------------------------------------------------------------

export interface McpFinding {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion: string | null;
}

export function trimFinding(finding: ReviewDtoFinding): McpFinding {
  return {
    id: finding.id,
    severity: finding.severity,
    category: finding.category,
    title: finding.title,
    file: finding.file,
    start_line: finding.start_line,
    end_line: finding.end_line,
    rationale: finding.rationale,
    suggestion: finding.suggestion ?? null,
  };
}

export interface McpReviewResult {
  run_id: string | null;
  agent_name: string | null;
  verdict: string | null;
  score: number | null;
  summary: string | null;
  findings: McpFinding[];
}

/** Never includes the full RunTrace/event log — just the verdict + findings. */
export function trimReview(review: ReviewDto): McpReviewResult {
  return {
    run_id: review.run_id,
    agent_name: review.agent_name ?? null,
    verdict: review.verdict,
    score: review.score,
    summary: review.summary,
    findings: review.findings.map(trimFinding),
  };
}

// ---------------------------------------------------------------------------
// Conventions (get_conventions)
// ---------------------------------------------------------------------------

export interface McpConvention {
  id: string;
  category: string;
  rule: string;
  status: string;
  evidence_path: string;
  evidence_line: number | null;
  rationale: string | null;
}

export function trimConvention(candidate: ConventionCandidate): McpConvention {
  return {
    id: candidate.id,
    category: candidate.category,
    rule: candidate.rule,
    status: candidate.status,
    evidence_path: candidate.evidence_path,
    evidence_line: candidate.evidence_line ?? null,
    rationale: candidate.rationale ?? null,
  };
}

// ---------------------------------------------------------------------------
// CallToolResult shaping
// ---------------------------------------------------------------------------

/** Success result: pretty-printed JSON as the tool's single text content block. */
export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** Error result (isError: true) — the client-visible message should name the fix. */
export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Best-effort human-readable message for any thrown error. AppError (and its
 *  NotFoundError/ConfigError/ValidationError subclasses) already carry a
 *  fix-oriented message from the service layer; anything else falls back to
 *  its own `message` or a stringified form. */
export function describeError(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Runs a tool handler body, turning any thrown error into an `isError: true`
 *  CallToolResult instead of crashing the MCP connection. */
export async function safeToolCall(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    return errorResult(describeError(err));
  }
}
