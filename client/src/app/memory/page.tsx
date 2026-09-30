import { FeaturePlaceholder } from "@/components/page-shell";

/* Route: /memory. Nav entry exists per design; screen not built yet — see
   root AGENTS.md course-template convention (FeaturePlaceholder). */
export default function MemoryPage() {
  return (
    <FeaturePlaceholder
      crumb={[{ label: "Memory" }]}
      title="Memory"
      icon="Brain"
      owner="a future iteration"
    />
  );
}
