/* TraceSection — collapsible titled section used throughout the trace tab. */
"use client";

import React from "react";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

export function TraceSection({
  icon,
  title,
  right,
  children,
  defaultOpen = true,
}: {
  icon: "Settings" | "Gauge" | "FileText" | "Wrench" | "Code" | "AlertOctagon" | "Check";
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const I = Icon[icon];
  return (
    <div className="mb-3.5 overflow-hidden rounded-lg border border-border bg-elevated">
      <div onClick={() => setOpen((o) => !o)} className="flex cursor-pointer items-center gap-2.5 px-4 py-3">
        <I size={15} className="text-subtle-foreground" aria-hidden />
        <span className="flex-1 text-base font-semibold">{title}</span>
        {right}
        <Icon.ChevronDown
          size={15}
          aria-hidden
          className={cn("text-subtle-foreground transition-transform duration-150", open && "rotate-180")}
        />
      </div>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}
