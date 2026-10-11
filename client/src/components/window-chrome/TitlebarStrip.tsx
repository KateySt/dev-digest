/* TitlebarStrip — for full-screen pages without the AppShell top bar (the
   first-run wizard, Add repository): a thin draggable strip with the window
   controls, so the frameless desktop window can still be moved and closed.
   Renders nothing in a browser. */
"use client";

import { useDesktop } from "@/lib/desktop";
import { WindowControls } from "./WindowControls";
import { s } from "./styles";

const HEIGHT = 40;

export function TitlebarStrip() {
  const desktop = useDesktop();
  if (!desktop) return null;
  return (
    <div className="app-drag" style={s.strip(HEIGHT)}>
      <WindowControls height={HEIGHT} />
    </div>
  );
}
