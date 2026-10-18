/* PrefRow — one labelled on/off setting row, shared by the Settings sections. */
"use client";

import React from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function PrefRow({
  label,
  hint,
  on,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    // A <label> names the switch button inside it and makes the whole row clickable.
    <label
      className={cn(
        "flex cursor-pointer items-center gap-4 border-b border-border py-3.5",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <div className="flex-1">
        <div className="text-base font-semibold text-foreground">{label}</div>
        <div className="mt-0.75 text-sm leading-[1.45] text-muted-foreground">{hint}</div>
      </div>
      <Switch checked={on} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}
