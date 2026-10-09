import { FeaturePlaceholder } from "@/components/page-shell";

/* Route: /conformance. Nav entry exists per design; screen not built yet —
   see root AGENTS.md course-template convention (FeaturePlaceholder). */
export default function ConformancePage() {
  return (
    <FeaturePlaceholder
      crumb={[{ label: "Conformance" }]}
      title="Conformance"
      icon="Shield"
      owner="a future iteration"
    />
  );
}
