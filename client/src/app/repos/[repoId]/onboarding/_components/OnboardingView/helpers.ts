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

/** Compact relative-time phrase for the header subtitle (C-AC-4) — same
 *  simple-unit-letters spirit as `context/_components/ProjectContextView`'s
 *  `formatAge`, just spelled out with "ago" since it's embedded directly
 *  into a full sentence here rather than a standalone footer chip. */
export function formatRelativeAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** C-AC-5 — a partial-index marker whenever the index covers FEWER files
 *  than were discovered; never presents the indexed count as full coverage. */
export function isPartialIndex(tour: { files_indexed: number; files_discovered: number }): boolean {
  return tour.files_indexed < tour.files_discovered;
}
