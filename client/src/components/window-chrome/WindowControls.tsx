/* WindowControls — minimize / maximize-restore / close for the frameless
   desktop window, drawn in the app's own style (Windows caption buttons:
   46px wide, full bar height, close turns red). Renders nothing in a browser
   and on macOS (which keeps its native traffic lights). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { useDesktop } from "@/lib/desktop";
import { cn } from "@/lib/utils";

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
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "app-no-drag grid h-full w-11.5 cursor-default place-items-center rounded-none border-none bg-transparent p-0 text-muted-foreground transition-colors duration-75",
        danger ? "hover:bg-[#e81123] hover:text-white" : "hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

export function WindowControls({ className }: { className?: string }) {
  const t = useTranslations("shell.window");
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
    <div className={cn("flex h-13 shrink-0 self-stretch", className)}>
      <CaptionButton label={t("minimize")} onClick={() => void win.minimize()}>
        <Icon.Minus size={15} strokeWidth={1.5} aria-hidden />
      </CaptionButton>
      <CaptionButton label={maximized ? t("restore") : t("maximize")} onClick={() => void win.toggleMaximize()}>
        {maximized ? <Icon.Copy size={13} strokeWidth={1.5} aria-hidden /> : <Icon.Square size={12} strokeWidth={1.5} aria-hidden />}
      </CaptionButton>
      <CaptionButton label={t("close")} danger onClick={() => void win.close()}>
        <Icon.X size={16} strokeWidth={1.5} aria-hidden />
      </CaptionButton>
    </div>
  );
}
