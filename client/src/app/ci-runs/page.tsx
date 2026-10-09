import { CiRunsView } from "./_components/CiRunsView";

/* Route: /ci-runs (global CI Runs page). Thin route entry — the view,
   filters, table, styles and i18n are colocated under _components/CiRunsView. */
export default function CiRunsPage() {
  return <CiRunsView />;
}
