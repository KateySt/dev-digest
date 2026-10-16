/* AppShell.tsx — thin orchestrator: sidebar + top bar around the page, plus the
   command palette, shortcuts help, global keyboard shortcuts, the first-run
   setup guard, and the shell context. Concerns live in ./hooks; overlay
   open/close is local view state. */
"use client";

import React from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { CommandPalette } from "./CommandPalette";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { Topbar } from "./Topbar";
import { useGlobalShortcuts, useSetupGuard, useShellCommands, useShellContext } from "./hooks";
import type { Crumb } from "./types";

export function AppShell({ children, crumb }: { children: React.ReactNode; crumb?: Crumb[] }) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const openPalette = React.useCallback(() => setPaletteOpen(true), []);
  const closePalette = React.useCallback(() => setPaletteOpen(false), []);
  const openHelp = React.useCallback(() => setHelpOpen(true), []);
  const closeHelp = React.useCallback(() => setHelpOpen(false), []);

  useSetupGuard();
  useGlobalShortcuts({ onOpenPalette: openPalette, onOpenHelp: openHelp });
  const commands = useShellCommands();
  const ctx = useShellContext({ onOpenCommandPalette: openPalette });

  return (
    <SidebarProvider className="h-full min-h-screen bg-background">
      <AppSidebar ctx={ctx} />
      <SidebarInset className="min-w-0">
        <Topbar ctx={ctx} crumb={crumb} />
        <main className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto h-full w-full max-w-[1600px]">{children}</div>
        </main>
      </SidebarInset>
      <CommandPalette open={paletteOpen} commands={commands} onClose={closePalette} />
      <ShortcutsHelp open={helpOpen} onClose={closeHelp} />
    </SidebarProvider>
  );
}
