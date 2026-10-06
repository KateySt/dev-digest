import { FeaturePlaceholder } from "@/components/page-shell";

/* Route: /multi-agent. Nav entry exists per design; screen not built yet —
   see root AGENTS.md course-template convention (FeaturePlaceholder). */
export default function MultiAgentReviewPage() {
  return (
    <FeaturePlaceholder
      crumb={[{ label: "Multi-Agent Review" }]}
      title="Multi-Agent Review"
      icon="Users"
      owner="a future iteration"
    />
  );
}
