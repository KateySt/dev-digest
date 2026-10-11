import type { IconName } from "@devdigest/ui";

/** Anchor ids for the five section cards — the SINGLE source of truth for
 *  section order (C-AC-6, C-AC-7). Both the anchor nav and the section-card
 *  list are driven from `SECTION_ORDER` so they can never drift apart. */
export const SECTION_IDS = {
  architecture: "onboarding-architecture",
  criticalPaths: "onboarding-critical-paths",
  runLocally: "onboarding-run-locally",
  readingPath: "onboarding-reading-path",
  firstTasks: "onboarding-first-tasks",
} as const;

export type SectionKey = "architecture" | "criticalPaths" | "runLocally" | "readingPath" | "firstTasks";

export const SECTION_ORDER: { id: string; key: SectionKey; icon: IconName }[] = [
  { id: SECTION_IDS.architecture, key: "architecture", icon: "Layers" },
  { id: SECTION_IDS.criticalPaths, key: "criticalPaths", icon: "GitBranch" },
  { id: SECTION_IDS.runLocally, key: "runLocally", icon: "Play" },
  { id: SECTION_IDS.readingPath, key: "readingPath", icon: "ListChecks" },
  { id: SECTION_IDS.firstTasks, key: "firstTasks", icon: "CheckCircle" },
];

/** "5m ago"-style age — shared with the notification center (lib/utils). */
export { formatRelativeAge } from "@/lib/utils";

/** C-AC-5 — a partial-index marker whenever the index covers FEWER files
 *  than were discovered; never presents the indexed count as full coverage. */
export function isPartialIndex(tour: { files_indexed: number; files_discovered: number }): boolean {
  return tour.files_indexed < tour.files_discovered;
}
