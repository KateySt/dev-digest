/* WindowControls — minimize / maximize-restore / close for the frameless
   desktop window, drawn in the app's own style. Renders nothing in a browser
   and on macOS (which keeps its native traffic lights). */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { useDesktop } from "@/lib/desktop";
import { s } from "./styles";

function CaptionButton({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="app-no-drag"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={s.button(hover, danger)}
    >
      {children}
    </button>
  );
}

export function WindowControls({ height = 52 }: { height?: number }) {
  const desktop = useDesktop();
  const [maximized, setMaximized] = React.useState(false);

  React.useEffect(() => {
    if (!desktop) return;
    let alive = true;
    void desktop.window.isMaximized().then((m) => alive && setMaximized(m));
    const unsubscribe = desktop.window.onMaximizedChange(setMaximized);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [desktop]);

  if (!desktop || desktop.platform === "darwin") return null;
  const { window: win } = desktop;
  return (
    <div style={s.controls(height)}>
      <CaptionButton label="Minimize window" onClick={() => void win.minimize()}>
        <Icon.Minus size={15} strokeWidth={1.5} />
      </CaptionButton>
      <CaptionButton label={maximized ? "Restore window" : "Maximize window"} onClick={() => void win.toggleMaximize()}>
        {maximized ? <Icon.Copy size={13} strokeWidth={1.5} /> : <Icon.Square size={12} strokeWidth={1.5} />}
      </CaptionButton>
      <CaptionButton label="Close window" danger onClick={() => void win.close()}>
        <Icon.X size={16} strokeWidth={1.5} />
      </CaptionButton>
    </div>
  );
}
