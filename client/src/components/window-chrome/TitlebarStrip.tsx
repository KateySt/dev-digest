/* TitlebarStrip — for full-screen pages without the AppShell top bar (the
   first-run wizard, Add repository): a thin draggable strip with the window
   controls, so the frameless desktop window can still be moved and closed.
   Renders nothing in a browser. */
"use client";

import { useDesktop } from "@/lib/desktop";
import { WindowControls } from "./WindowControls";

export function TitlebarStrip() {
  const desktop = useDesktop();
  if (!desktop) return null;
  return (
    <div className="app-drag fixed inset-x-0 top-0 z-50 flex h-10 justify-end">
      <WindowControls className="h-10" />
    </div>
  );
}
