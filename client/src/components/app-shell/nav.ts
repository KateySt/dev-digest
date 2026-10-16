/* nav.ts — sidebar nav groups + keyboard shortcut registry.
   hrefs use the :repoId token, filled from the active repo. Labels come from
   messages/en/shell.json: `nav.<key>`, `navSection.<section>`, `shortcuts.*`. */
import type { IconName } from "@/components/icon";

export interface NavItemDef {
  key: string;
  icon: IconName;
  /** Route template; :repoId is replaced with the active repo id. */
  href: string;
  /** Optional g-nav shortcut suffix (e.g. "p" → g then p). */
  gKey?: string;
}

export interface NavGroup {
  section: "workspace" | "skillsLab" | "global";
  items: NavItemDef[];
}

export const NAV: NavGroup[] = [
  {
    section: "workspace",
    items: [
      { key: "pulls", icon: "GitPullRequest", href: "/repos/:repoId/pulls", gKey: "p" },
      { key: "onboarding-tour", icon: "Target", href: "/repos/:repoId/onboarding", gKey: "o" },
      { key: "context", icon: "FileText", href: "/repos/:repoId/context", gKey: "x" },
    ],
  },
  {
    section: "skillsLab",
    items: [
      { key: "skills", icon: "Sparkles", href: "/skills", gKey: "s" },
      { key: "agents", icon: "Cpu", href: "/agents", gKey: "a" },
      { key: "conventions", icon: "ListChecks", href: "/conventions", gKey: "v" },
      { key: "eval", icon: "Gauge", href: "/eval", gKey: "e" },
    ],
  },
  {
    section: "global",
    items: [
      { key: "memory", icon: "Brain", href: "/memory", gKey: "m" },
      { key: "multi-agent", icon: "Users", href: "/multi-agent", gKey: "r" },
      { key: "agent-performance", icon: "Activity", href: "/agent-performance", gKey: "f" },
      { key: "ci-runs", icon: "Workflow", href: "/ci-runs", gKey: "c" },
    ],
  },
];

export const SETTINGS_ITEM: NavItemDef = {
  key: "settings",
  icon: "Settings",
  href: "/settings/api-keys",
  gKey: ",",
};

export type ShortcutGroup = "global" | "navigation" | "findings";

/** Keyboard shortcut cheat sheet. `label` is a `shell.shortcuts.*` key, or a
 *  nav key for the "Go to …" entries (`navKey`). */
export interface ShortcutDef {
  keys: string;
  group: ShortcutGroup;
  label?: "openPalette" | "showHelp" | "nextPrevFinding" | "acceptFinding" | "dismissFinding";
  navKey?: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  { keys: "⌘K", group: "global", label: "openPalette" },
  { keys: "?", group: "global", label: "showHelp" },
  ...NAV.flatMap((g) => g.items)
    .filter((it) => it.gKey)
    .map((it): ShortcutDef => ({ keys: `g ${it.gKey}`, group: "navigation", navKey: it.key })),
  { keys: "j / k", group: "findings", label: "nextPrevFinding" },
  { keys: "a", group: "findings", label: "acceptFinding" },
  { keys: "d", group: "findings", label: "dismissFinding" },
];

/** Resolve an :repoId-templated href against the active repo id. */
export function resolveHref(href: string, repoId: string | null | undefined): string {
  if (!href.includes(":repoId")) return href;
  return href.replace(":repoId", repoId ?? "_");
}
