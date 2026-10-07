import { Suspense } from "react";
import { EvalDashboardView } from "./_components/EvalDashboardView";

/* Route: /eval?tab=agents|skills (global Eval Dashboard). Thin route entry — the
   shell, its Agents / Skills overviews, styles and i18n are colocated under
   _components/EvalDashboardView. Suspense is required by useSearchParams. */
export default function EvalPage() {
  return (
    <Suspense fallback={null}>
      <EvalDashboardView />
    </Suspense>
  );
}
