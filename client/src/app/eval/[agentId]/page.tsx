import { Suspense } from "react";
import { AgentEvalDashboard } from "./_components/AgentEvalDashboard";

/* Route: /eval/[agentId]?range=7d|30d|90d|all (per-agent eval dashboard). Thin
   route entry — the view and its parts are colocated under
   _components/AgentEvalDashboard. Suspense is required by useSearchParams. */
export default function AgentEvalPage() {
  return (
    <Suspense fallback={null}>
      <AgentEvalDashboard />
    </Suspense>
  );
}
