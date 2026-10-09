/* hooks/eval-runs.ts — versioned suite runs: start, poll progress, per-owner
   history (range-filtered), compare. Backs the Evals tabs (agent + skill), the
   per-agent / per-skill dashboards and the skill run controller. */
"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { isScanBlocking } from "@/lib/skill-scan";
import { useEvalCases } from "./eval-cases";
import { EVAL_POLL_MS } from "./eval-dashboard";
import type {
  AgentEvalRuns,
  AnyEvalSuiteRunDetail,
  EvalCompare,
  EvalRange,
  EvalSuiteRunStatus,
  Skill,
  SkillEvalCompare,
  SkillEvalRuns,
  SkillEvalSuiteRunDetail,
  StartEvalRunResponse,
  StartSkillEvalRunBody,
  StartSkillEvalRunResponse,
} from "@devdigest/shared";

/** Who owns a suite run — drives which cached queries a finished run refreshes. */
export interface EvalRunOwner {
  kind: "agent" | "skill";
  id: string;
}

/** Everything a started/finished run can change for an agent. */
function useInvalidateAgentEval() {
  const qc = useQueryClient();
  return (agentId: string) => {
    qc.invalidateQueries({ queryKey: ["eval-stats", "agent", agentId] });
    qc.invalidateQueries({ queryKey: ["eval-cases", "agent", agentId] });
    qc.invalidateQueries({ queryKey: ["agent-eval-runs", agentId] });
    qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    qc.invalidateQueries({ queryKey: ["agent", agentId] });
  };
}

/** Everything a started/finished run can change for a skill. */
function useInvalidateSkillEval() {
  const qc = useQueryClient();
  return (skillId: string) => {
    qc.invalidateQueries({ queryKey: ["eval-stats", "skill", skillId] });
    qc.invalidateQueries({ queryKey: ["eval-cases", "skill", skillId] });
    qc.invalidateQueries({ queryKey: ["skill-eval-runs", skillId] });
    qc.invalidateQueries({ queryKey: ["eval-dashboard-skills"] });
    qc.invalidateQueries({ queryKey: ["skill", skillId] });
  };
}

/** POST /agents/:id/eval-runs — starts a background suite run (202). */
export function useStartAgentEvalRun() {
  const invalidate = useInvalidateAgentEval();
  return useMutation({
    mutationFn: (agentId: string) => api.post<StartEvalRunResponse>(`/agents/${agentId}/eval-runs`),
    onSuccess: (_d, agentId) => invalidate(agentId),
  });
}

/** POST /skills/:id/eval-runs — starts a background suite run (202). With
 *  `draftBody` it runs that unsaved text as a draft run (no version created);
 *  `draft_body` is only sent when defined. */
export function useStartSkillEvalRun() {
  const invalidate = useInvalidateSkillEval();
  return useMutation({
    mutationFn: ({ skillId, draftBody }: { skillId: string; draftBody?: string }) => {
      const body: StartSkillEvalRunBody | undefined = draftBody !== undefined ? { draft_body: draftBody } : undefined;
      return api.post<StartSkillEvalRunResponse>(`/skills/${skillId}/eval-runs`, body);
    },
    onSuccess: (_d, { skillId }) => invalidate(skillId),
  });
}

/** GET /eval-suite-runs/:id — progress + per-case results (agent or skill, the
 *  payload is discriminated by `owner_kind`). Polls every 2s while the run is
 *  `running`, stops when it completes/fails, and refreshes the owner's
 *  stats/cases/history once on that transition (no page reload). */
export function useEvalSuiteRun(runId: string | null | undefined, owner?: EvalRunOwner | null) {
  const invalidateAgent = useInvalidateAgentEval();
  const invalidateSkill = useInvalidateSkillEval();
  const query = useQuery({
    queryKey: ["eval-suite-run", runId],
    queryFn: () => api.get<AnyEvalSuiteRunDetail>(`/eval-suite-runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (q) => (q.state.data?.status === "running" ? EVAL_POLL_MS : false),
  });

  const status = query.data?.status;
  const wasRunning = useRef(false);
  const ownerKind = owner?.kind;
  const ownerId = owner?.id;
  useEffect(() => {
    if (status === "running") {
      wasRunning.current = true;
    } else if (status && wasRunning.current) {
      wasRunning.current = false;
      if (ownerId) (ownerKind === "skill" ? invalidateSkill : invalidateAgent)(ownerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, ownerKind, ownerId]);

  return query;
}

/** GET /agents/:id/eval-runs?range= — range-filtered runs (newest first),
 *  all-time history for cards/sparklines, regression alert. Polls while any
 *  listed run is still running so the table updates live. */
export function useAgentEvalRuns(agentId: string | null | undefined, range: EvalRange) {
  return useQuery({
    queryKey: ["agent-eval-runs", agentId, range],
    queryFn: () => api.get<AgentEvalRuns>(`/agents/${agentId}/eval-runs?range=${range}`),
    enabled: !!agentId,
    refetchInterval: (q) =>
      (q.state.data?.runs ?? []).some((r) => r.status === "running") ? EVAL_POLL_MS : false,
  });
}

/** GET /skills/:id/eval-runs?range= — like `useAgentEvalRuns`, plus the skill's
 *  latest draft run. Polls while a listed run or the draft is still running. */
export function useSkillEvalRuns(skillId: string | null | undefined, range: EvalRange) {
  return useQuery({
    queryKey: ["skill-eval-runs", skillId, range],
    queryFn: () => api.get<SkillEvalRuns>(`/skills/${skillId}/eval-runs?range=${range}`),
    enabled: !!skillId,
    refetchInterval: (q) => {
      const d = q.state.data;
      const running = (d?.runs ?? []).some((r) => r.status === "running") || d?.latest_draft?.status === "running";
      return running ? EVAL_POLL_MS : false;
    },
  });
}

/** GET /agents/:id/eval-runs/compare?base&head — enabled once both ids exist. */
export function useEvalCompare(
  agentId: string | null | undefined,
  baseRunId: string | null | undefined,
  headRunId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["eval-compare", agentId, baseRunId, headRunId],
    queryFn: () =>
      api.get<EvalCompare>(`/agents/${agentId}/eval-runs/compare?base=${baseRunId}&head=${headRunId}`),
    enabled: !!agentId && !!baseRunId && !!headRunId,
  });
}

/** GET /skills/:id/eval-runs/compare?base&head — enabled once both ids exist. */
export function useSkillEvalCompare(
  skillId: string | null | undefined,
  baseRunId: string | null | undefined,
  headRunId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["skill-eval-compare", skillId, baseRunId, headRunId],
    queryFn: () =>
      api.get<SkillEvalCompare>(`/skills/${skillId}/eval-runs/compare?base=${baseRunId}&head=${headRunId}`),
    enabled: !!skillId && !!baseRunId && !!headRunId,
  });
}

const isSkillRunDetail = (d: AnyEvalSuiteRunDetail): d is SkillEvalSuiteRunDetail => "is_draft" in d;

// ---- skill run controller ---------------------------------------------------

/** Why a skill run can't be started right now (the component renders the text). */
export type SkillRunBlock =
  | { kind: "scan"; status: Skill["scan_status"] }
  | { kind: "running" }
  | { kind: "noCases" };

export interface SkillEvalActivity {
  /** True while a suite or draft run of this skill is starting or running. */
  running: boolean;
  /** Progress of the running run (null when idle). */
  progress: { done: number; total: number } | null;
  /** Why starting is disabled, or null when allowed. Scan > running > no cases. */
  disabledReason: SkillRunBlock | null;
  /** Server's message when the last start was refused (scan, 409, no cases). */
  startError: string | null;
  /** Start a normal suite run, or a draft run when `draftBody` is given. */
  start: (draftBody?: string) => void;
  /** The skill's draft run (just started here or loaded from the server), if any. */
  draft: SkillEvalSuiteRunDetail | null;
  /** Number of cases owned by the skill (0 while loading). */
  caseCount: number;
}

/**
 * Composite controller for one skill's eval runs, shared by the Skill Editor
 * header ("Run on evals") and the Evals tab ("Run all evals", per-row Run) so
 * both gate on, and show, the same state. The active run is the one started
 * here, else a run the server still reports as running (suite run or draft)
 * — so progress survives a page reload. A refused start surfaces the server's
 * message and never begins polling (the run id is only remembered on success).
 */
export function useSkillEvalActivity(
  skillId: string,
  /** The skill's scan state; omit while it is still loading (nothing is gated on it then). */
  skill?: Pick<Skill, "scan_status" | "scan_findings">,
): SkillEvalActivity {
  const startRun = useStartSkillEvalRun();
  const { data: cases } = useEvalCases("skill", skillId);
  const runs = useSkillEvalRuns(skillId, "all");

  // Remember which skill the run belongs to so switching skills never shows
  // (or polls on behalf of) another skill's run.
  const [started, setStarted] = useState<{ skillId: string; runId: string } | null>(null);
  const startedRunId = started?.skillId === skillId ? started.runId : null;

  const serverRunning = runs.data?.runs.find((r) => r.status === "running");
  const serverDraftRunning = runs.data?.latest_draft?.status === "running" ? runs.data.latest_draft : null;
  const serverRunningId = serverRunning?.id ?? serverDraftRunning?.id ?? null;

  // Keep polling the run started here even after the caller switches to another
  // skill (same query key as `suite` below while they match, so no extra request).
  useEvalSuiteRun(started?.runId, started ? { kind: "skill", id: started.skillId } : null);
  const suite = useEvalSuiteRun(startedRunId ?? serverRunningId, { kind: "skill", id: skillId });
  const suiteData = suite.data;
  const status: EvalSuiteRunStatus | undefined = suiteData?.status;
  const running = startRun.isPending || status === "running" || (!!serverRunningId && !suiteData) ||
    // Start succeeded but the first status hasn't arrived: stay "running" so controls don't re-enable.
    (!!startedRunId && suite.isPending);

  const total = suiteData?.cases_total ?? serverRunning?.cases_total ?? serverDraftRunning?.cases_total ?? 0;
  const done = suiteData?.cases_done ?? serverRunning?.cases_done ?? serverDraftRunning?.cases_done ?? 0;

  const caseCount = cases?.length ?? 0;
  const casesLoaded = cases !== undefined;
  let disabledReason: SkillRunBlock | null = null;
  if (skill && isScanBlocking(skill.scan_status, skill.scan_findings)) disabledReason = { kind: "scan", status: skill.scan_status };
  else if (running) disabledReason = { kind: "running" };
  else if (casesLoaded && caseCount === 0) disabledReason = { kind: "noCases" };

  const activeDraft = suiteData && isSkillRunDetail(suiteData) && suiteData.is_draft ? suiteData : null;
  const draft = activeDraft ?? runs.data?.latest_draft ?? null;

  const start = (draftBody?: string) => {
    startRun.mutate(
      { skillId, draftBody },
      { onSuccess: (r) => setStarted({ skillId, runId: r.run_id }) },
    );
  };

  return {
    running,
    progress: running ? { done, total: total || caseCount } : null,
    disabledReason,
    startError: startRun.error?.message ?? null,
    start,
    draft,
    caseCount,
  };
}
