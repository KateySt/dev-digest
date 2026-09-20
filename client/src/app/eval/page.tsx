import { EvalDashboardView } from "./_components/EvalDashboardView";

/* Route: /eval (global Eval Dashboard). Thin route entry — the view, its
   chart, table, styles and i18n are colocated under _components/EvalDashboardView. */
export default function EvalPage() {
  return <EvalDashboardView />;
}
