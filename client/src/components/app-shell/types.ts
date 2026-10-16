import type React from "react";
import type { IconName } from "@/components/icon";

export interface Crumb {
  label: string;
  mono?: boolean;
  href?: string;
}

export interface RepoSummary {
  id: string;
  full_name: string;
  default_branch?: string;
  synced: boolean;
}

/** A command-palette entry. */
export interface Command {
  id: string;
  label: string;
  group?: string;
  icon?: IconName;
  hint?: string;
  run: () => void;
}

/** Everything the shell chrome (sidebar + top bar) needs, assembled by useShellContext. */
export interface ShellContext {
  /** Active nav key (e.g. "pulls"). */
  activeKey: string;
  /** Active repo id, used to fill :repoId in hrefs. */
  repoId: string | null;
  repos: RepoSummary[];
  activeRepo: RepoSummary | null;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenCommandPalette: () => void;
  onSelectRepo: (id: string) => void;
  onAddRepo: () => void;
  onRemoveRepo: (id: string) => void;
  /** PRs that still need review; hidden when undefined. */
  prCount?: number;
  notifications: React.ReactNode;
  account: React.ReactNode;
  /** Desktop app: window controls rendered flush at the far right of the top bar. */
  windowControls?: React.ReactNode;
  /** Desktop app: the top bar doubles as the window's title bar. */
  desktop: boolean;
  /** Desktop app on macOS: keep the sidebar's top-left clear for the traffic lights. */
  macTrafficLights: boolean;
}
