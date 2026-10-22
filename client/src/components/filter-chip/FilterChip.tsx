import type React from "react";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

/** Toggleable filter chip (status / severity filters) with an optional icon
 *  and count. `iconClassName` tints just the icon (e.g. a severity colour). */
export function FilterChip({
  children,
  active,
  onClick,
  icon,
  iconClassName,
  count,
}: {
  children?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  icon?: IconName;
  iconClassName?: string;
  count?: number;
}) {
  const I = icon ? Icon[icon] : null;
  return (
    <button
      type="button"
      aria-pressed={active ?? false}
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.25 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-brand-bg text-brand-text"
          : "border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {I && <I size={13} className={iconClassName} aria-hidden />}
      {children}
      {count != null && <span className="tnum text-xs opacity-70">{count}</span>}
    </button>
  );
}
