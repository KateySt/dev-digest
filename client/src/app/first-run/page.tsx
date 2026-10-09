import { FeaturePlaceholder } from "@/components/page-shell";

/* Route: /first-run. Nav entry exists per design; screen not built yet —
   see root AGENTS.md course-template convention (FeaturePlaceholder). */
export default function FirstRunSetupPage() {
  return (
    <FeaturePlaceholder
      crumb={[{ label: "First-run setup" }]}
      title="First-run setup"
      icon="Play"
      owner="a future iteration"
    />
  );
}
