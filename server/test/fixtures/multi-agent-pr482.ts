import type { FindingRecord } from '@devdigest/shared';
import type { AgentRunInput } from '../../src/modules/multi-agent/helpers.js';

/** Build a FindingRecord with sensible defaults for helper tests. */
export function mkFinding(over: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    review_id: 'rev-1',
    accepted_at: null,
    dismissed_at: null,
    severity: 'WARNING',
    category: 'bug',
    title: 'Some issue',
    file: 'src/a.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'because',
    suggestion: null,
    confidence: 0.5,
    ...over,
  };
}

export function mkRun(
  agent: string,
  findings: FindingRecord[],
  status: AgentRunInput['status'] = 'done',
): AgentRunInput {
  return { run_id: `run-${agent}`, agent_id: agent, agent_name: agent, status, findings };
}

/**
 * Synthetic PR #482 multi-run (selection order: Security, Performance,
 * Customer-Facing). Customer-Facing exists only in this fixture (S-AC-33).
 */
export const PR482_RETRY_AFTER_SECURITY = 'f-sec-retry-after';
export const PR482_RETRY_AFTER_CUSTOMER = 'f-cf-retry-after';
export const PR482_ERROR_CODE_CUSTOMER = 'f-cf-error-code';

export function pr482Runs(): AgentRunInput[] {
  const security = mkRun('Security', [
    mkFinding({
      id: PR482_RETRY_AFTER_SECURITY,
      severity: 'WARNING',
      category: 'security',
      title: 'Retry-After header omitted on 429',
      file: 'src/middleware/ratelimit.ts',
      start_line: 52,
      end_line: 52,
      confidence: 0.8,
    }),
  ]);
  const performance = mkRun('Performance', [
    mkFinding({
      id: 'f-perf-redis-roundtrip',
      severity: 'SUGGESTION',
      category: 'perf',
      title: 'Counter incremented with two Redis round trips',
      file: 'src/middleware/ratelimit.ts',
      start_line: 30,
      end_line: 34,
    }),
  ]);
  const customer = mkRun('Customer-Facing', [
    mkFinding({
      id: PR482_RETRY_AFTER_CUSTOMER,
      severity: 'CRITICAL',
      category: 'bug',
      title: 'Retry-After header omitted on 429',
      file: 'src/middleware/ratelimit.ts',
      start_line: 52,
      end_line: 52,
      confidence: 0.9,
    }),
    mkFinding({
      id: PR482_ERROR_CODE_CUSTOMER,
      severity: 'WARNING',
      category: 'style',
      title: '429 body has no machine-readable error code',
      file: 'src/middleware/ratelimit.ts',
      start_line: 52,
      end_line: 52,
      confidence: 0.7,
    }),
  ]);
  return [security, performance, customer];
}

/**
 * Real PR #484 multi-run (selection order: General Reviewer, API Contract
 * Reviewer). API Contract has two findings overlapping General's (S-AC-48).
 */
export const PR484_GENERAL = 'f-gen-shape';
export const PR484_API_EMAIL = 'f-api-email';
export const PR484_API_RENAME = 'f-api-rename';

export function pr484Runs(): AgentRunInput[] {
  const general = mkRun('General Reviewer', [
    mkFinding({
      id: PR484_GENERAL,
      category: 'bug',
      title:
        'Removal of email field and renaming of created_at to createdAt changes response shape, potentially breaking downstream consumers',
      file: 'src/api/users.ts',
      start_line: 43,
      end_line: 49,
    }),
  ]);
  const api = mkRun('API Contract Reviewer', [
    mkFinding({
      id: PR484_API_EMAIL,
      category: 'security',
      title: 'Removal of `email` field from user lookup response',
      file: 'src/api/users.ts',
      start_line: 40,
      end_line: 48,
    }),
    mkFinding({
      id: PR484_API_RENAME,
      category: 'security',
      title: 'Renaming of `created_at` to `createdAt` in user lookup response',
      file: 'src/api/users.ts',
      start_line: 40,
      end_line: 48,
    }),
  ]);
  return [general, api];
}
