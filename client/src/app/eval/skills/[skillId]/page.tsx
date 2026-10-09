import { Suspense } from "react";
import { SkillEvalDashboard } from "./_components/SkillEvalDashboard";

/* Route: /eval/skills/[skillId]?range=7d|30d|90d|all (per-skill eval dashboard).
   Thin route entry — the view and its parts are colocated under
   _components/SkillEvalDashboard. Suspense is required by useSearchParams. */
export default function SkillEvalPage() {
  return (
    <Suspense fallback={null}>
      <SkillEvalDashboard />
    </Suspense>
  );
}
