import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { AgentRunRow, SkillRow, SkillVersionRow } from '../../db/rows.js';
import type { AgentSkillLinkRow, SkillFindingOutcomeRow } from './repository.js';
import { STATS_WINDOW_DAYS } from './constants.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and the
 * body-version-bump rule. No I/O.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** True when a patch changes `body` relative to the existing row — only a
 *  body change bumps the skill's version and snapshots `skill_versions`
 *  (unlike agents, cosmetic fields like name/description/type don't). */
export function isBodyChange(existing: Pick<SkillRow, 'body'>, patch: { body?: string }): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}

/** Derive a skill name from the first markdown heading (`#`/`##`) in `body`,
 *  falling back to `fallback` when no heading is found. Used by file/URL
 *  import when the user leaves the name field blank. */
export function nameFromMarkdown(body: string, fallback: string): string {
  const match = body.match(/^#{1,2}\s+(.+)$/m);
  const heading = match?.[1]?.trim();
  return heading && heading.length > 0 ? heading : fallback;
}

/** Map a `skill_versions` row to the Versions tab's list item. */
export function toSkillVersionListItem(row: SkillVersionRow, currentVersion: number) {
  return {
    version: row.version,
    created_at: row.createdAt.toISOString(),
    body: row.body,
    current: row.version === currentVersion,
  };
}
export type SkillVersionListItem = ReturnType<typeof toSkillVersionListItem>;

/**
 * Ad-hoc (non-Zod, display-only) Stats-tab aggregate — see
 * `SkillsRepository.findingOutcomesForAgents`'s doc comment for why this is
 * an APPROXIMATION (findings aren't attributed to a specific skill, only to
 * the agent that produced them; this rolls up every agent currently linked
 * to the skill).
 */
export interface SkillStats {
  used_by_agents: number;
  agents: { id: string; name: string }[];
  /** Share of runs (across those agents) that produced ≥1 finding, 0..1. */
  pull_frequency: number | null;
  /** accepted / (accepted + dismissed) across those agents' findings, 0..1. */
  accept_rate: number | null;
  findings_30d: number;
  findings_by_category: { category: string; count: number }[];
}

export function computeSkillStats(
  agents: { id: string; name: string }[],
  runs: AgentRunRow[],
  findingRows: SkillFindingOutcomeRow[],
): SkillStats {
  const runsWithFindings = runs.filter((r) => (r.findingsCount ?? 0) > 0).length;
  const pullFrequency = runs.length > 0 ? runsWithFindings / runs.length : null;

  const accepted = findingRows.filter((f) => f.acceptedAt != null).length;
  const dismissed = findingRows.filter((f) => f.dismissedAt != null).length;
  const acted = accepted + dismissed;
  const acceptRate = acted > 0 ? accepted / acted : null;

  const cutoff = Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const findings30d = findingRows.filter((f) => f.reviewCreatedAt.getTime() >= cutoff).length;

  const byCategory = new Map<string, number>();
  for (const f of findingRows) byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1);
  const findingsByCategory = [...byCategory.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return {
    used_by_agents: agents.length,
    agents,
    pull_frequency: pullFrequency,
    accept_rate: acceptRate,
    findings_30d: findings30d,
    findings_by_category: findingsByCategory,
  };
}

/** The Skills list card's lightweight usage row ("3 agents · 71% pull ·
 *  74% accept") — same approximation as `SkillStats`, just the two rates
 *  plus the agent count, batched for every skill in one pass instead of one
 *  `/skills/:id/stats` query per card. */
export interface SkillUsageSummary {
  used_by_agents: number;
  pull_frequency: number | null;
  accept_rate: number | null;
}

interface AgentAggregate {
  runsTotal: number;
  runsWithFindings: number;
  accepted: number;
  dismissed: number;
}

function aggregateByAgent(runs: AgentRunRow[], findingRows: SkillFindingOutcomeRow[]): Map<string, AgentAggregate> {
  const byAgent = new Map<string, AgentAggregate>();
  const ensure = (agentId: string): AgentAggregate => {
    let e = byAgent.get(agentId);
    if (!e) {
      e = { runsTotal: 0, runsWithFindings: 0, accepted: 0, dismissed: 0 };
      byAgent.set(agentId, e);
    }
    return e;
  };
  for (const r of runs) {
    if (!r.agentId) continue;
    const e = ensure(r.agentId);
    e.runsTotal++;
    if ((r.findingsCount ?? 0) > 0) e.runsWithFindings++;
  }
  for (const f of findingRows) {
    if (!f.agentId) continue;
    const e = ensure(f.agentId);
    if (f.acceptedAt != null) e.accepted++;
    if (f.dismissedAt != null) e.dismissed++;
  }
  return byAgent;
}

/** Batched version of the pull-frequency/accept-rate math in
 *  `computeSkillStats`, grouped by agent first so every skill's summary is a
 *  cheap sum over its linked agents instead of a separate DB round-trip. */
export function computeSkillUsageSummaries(
  skillIds: string[],
  links: AgentSkillLinkRow[],
  runs: AgentRunRow[],
  findingRows: SkillFindingOutcomeRow[],
): Map<string, SkillUsageSummary> {
  const perAgent = aggregateByAgent(runs, findingRows);

  const agentsBySkill = new Map<string, Set<string>>();
  for (const link of links) {
    if (!agentsBySkill.has(link.skillId)) agentsBySkill.set(link.skillId, new Set());
    agentsBySkill.get(link.skillId)!.add(link.agentId);
  }

  const result = new Map<string, SkillUsageSummary>();
  for (const skillId of skillIds) {
    const agentIds = [...(agentsBySkill.get(skillId) ?? [])];
    let runsTotal = 0;
    let runsWithFindings = 0;
    let accepted = 0;
    let dismissed = 0;
    for (const agentId of agentIds) {
      const e = perAgent.get(agentId);
      if (!e) continue;
      runsTotal += e.runsTotal;
      runsWithFindings += e.runsWithFindings;
      accepted += e.accepted;
      dismissed += e.dismissed;
    }
    const acted = accepted + dismissed;
    result.set(skillId, {
      used_by_agents: agentIds.length,
      pull_frequency: runsTotal > 0 ? runsWithFindings / runsTotal : null,
      accept_rate: acted > 0 ? accepted / acted : null,
    });
  }
  return result;
}
