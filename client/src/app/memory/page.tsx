import { Suspense } from "react";
import { MemoryView } from "./_components/MemoryView";

/* Route: /memory (SPEC-2026-10-12-memory). Suspense: MemoryView reads
   useSearchParams (`?id=` preselect from a finding's "Learned" link). */
export default function MemoryPage() {
  return (
    <Suspense>
      <MemoryView />
    </Suspense>
  );
}
