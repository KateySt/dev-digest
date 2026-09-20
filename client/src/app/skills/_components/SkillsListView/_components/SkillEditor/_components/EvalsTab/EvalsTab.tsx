"use client";

import type { Skill } from "@devdigest/shared";
import { EvalsTab as SharedEvalsTab } from "@/app/agents/[id]/_components/AgentEditor/_components/EvalsTab";
import { useRunAllSkillEvalCases } from "@/lib/hooks/eval-cases";

/** Skill Editor's Evals tab — the same owner-agnostic `EvalsTab` the Agent
 *  Editor uses (see that component's doc comment), wired to this skill and
 *  its "Run all evals" batch action (a skill has no global dashboard to run
 *  all its cases from, unlike an agent). */
export function EvalsTab({ skill }: { skill: Skill }) {
  const runAll = useRunAllSkillEvalCases();
  return (
    <SharedEvalsTab
      ownerKind="skill"
      ownerId={skill.id}
      onRunAll={() => runAll.mutate(skill.id)}
      runAllPending={runAll.isPending}
    />
  );
}
