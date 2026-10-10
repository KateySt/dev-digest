import { Suspense } from "react";
import { ConfigureRun } from "./_components/ConfigureRun";

/* Route: /multi-agent (Configure run). Thin route entry — the view, its
   helpers, styles and tests are colocated under _components/ConfigureRun.
   Suspense is required because the view reads `?pr` via useSearchParams. */
export default function MultiAgentReviewPage() {
  return (
    <Suspense fallback={null}>
      <ConfigureRun />
    </Suspense>
  );
}
