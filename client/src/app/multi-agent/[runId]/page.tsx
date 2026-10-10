import { Suspense } from "react";
import { MultiAgentResults } from "./_components/MultiAgentResults";

/* Route: /multi-agent/[runId] (results). Thin route entry — the view reads the
   run id via useParams and `?view` / `?trace` via useSearchParams, hence Suspense. */
export default function MultiAgentResultsPage() {
  return (
    <Suspense fallback={null}>
      <MultiAgentResults />
    </Suspense>
  );
}
