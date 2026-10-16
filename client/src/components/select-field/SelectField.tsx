"use client";

import React from "react";
import { optionLabel, optionValue, type SelectOption } from "@/components/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Single-select over a short option list (shadcn Select). Options are bare
 *  values or `{ value, label }`. Without `onChange` it renders read-only. */
export function SelectField({
  value,
  onChange,
  options,
  mono = true,
  ariaLabel,
  className,
}: {
  value: string;
  onChange?: (value: string) => void;
  options: readonly SelectOption[];
  mono?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  // A value that is not one of the options (e.g. a "Select…" prompt) is shown
  // as placeholder text rather than leaving the trigger blank.
  const known = options.some((o) => optionValue(o) === value);
  return (
    <Select value={known ? value : ""} onValueChange={onChange} disabled={!onChange}>
      <SelectTrigger aria-label={ariaLabel} className={cn("w-full", mono && "mono", className)}>
        <SelectValue placeholder={known ? undefined : value} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={optionValue(o)} value={optionValue(o)} className={cn(mono && "mono")}>
            {optionLabel(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
