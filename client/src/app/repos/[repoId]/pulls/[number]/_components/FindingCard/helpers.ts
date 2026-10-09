import type { EvalCaseTarget, FindingRecord } from "@devdigest/shared";

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/** The kind of eval case a decided finding becomes: accepted → must find,
 *  dismissed → must not flag; null while undecided. */
export function evalKindFor(f: Pick<FindingRecord, "accepted_at" | "dismissed_at">): "must_find" | "must_not_flag" | null {
  if (f.accepted_at) return "must_find";
  if (f.dismissed_at) return "must_not_flag";
  return null;
}

/** Editable reply body prefilled from the finding's title, rationale and
 *  suggestion. The user can change it before confirming; it is posted verbatim. */
export function buildReplyBody(
  f: Pick<FindingRecord, "title" | "rationale" | "suggestion">,
  suggestionHeading: string,
): string {
  const parts = [`**${f.title}**`, f.rationale];
  if (f.suggestion) parts.push(`**${suggestionHeading}**\n${f.suggestion}`);
  return parts.join("\n\n");
}

/** A skill linked to the finding's agent — a possible "Turn into eval case" target. */
export interface LinkedSkill {
  id: string;
  name: string;
}

/** One "Turn into eval case" target as the picker shows it. */
export interface EvalTarget extends EvalCaseTarget {
  /** Stable map key: `agent` or `skill:<id>`. */
  key: string;
  /** Display name — null for the agent (its name isn't known to the card). */
  name: string | null;
}

export const evalTargetKey = (t: EvalCaseTarget): string => (t.kind === "agent" ? "agent" : `skill:${t.id}`);

/** The agent target first (the default), then each linked skill in order. */
export function buildEvalTargets(agentId: string, linkedSkills: readonly LinkedSkill[]): EvalTarget[] {
  return [
    { kind: "agent", id: agentId, key: "agent", name: null },
    ...linkedSkills.map((sk): EvalTarget => ({ kind: "skill", id: sk.id, key: `skill:${sk.id}`, name: sk.name })),
  ];
}

/** The case id a finding already has for `target`: from the per-target list the
 *  server sends, else (older payloads) the single legacy `eval_case_id`, which
 *  is always the agent's. */
export function existingCaseId(
  f: Pick<FindingRecord, "eval_cases" | "eval_case_id">,
  target: EvalCaseTarget,
): string | null {
  const hit = f.eval_cases?.find((c) => c.target_kind === target.kind && c.target_id === target.id);
  if (hit) return hit.case_id;
  if (!f.eval_cases && target.kind === "agent") return f.eval_case_id ?? null;
  return null;
}

/** Where a target's cases live: the agent's or the skill's Evals tab. */
export function evalsHrefFor(target: EvalCaseTarget): string {
  return target.kind === "agent" ? `/agents/${target.id}?tab=evals` : `/skills?skill=${target.id}&tab=evals`;
}
