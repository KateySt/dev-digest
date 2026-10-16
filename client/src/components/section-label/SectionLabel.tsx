import React from "react";
import { Icon, type IconName } from "@/components/icon";

/** Small uppercase section heading with an optional icon and right-aligned slot. */
export function SectionLabel({
  children,
  icon,
  right,
}: {
  children?: React.ReactNode;
  icon?: IconName;
  right?: React.ReactNode;
}) {
  const I = icon ? Icon[icon] : null;
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      {I && <I size={14} className="text-subtle-foreground" aria-hidden />}
      <span className="text-xs font-bold tracking-[0.07em] text-subtle-foreground uppercase">{children}</span>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}
