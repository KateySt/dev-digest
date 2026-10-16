"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { optionLabel, optionValue, type SelectOption } from "./helpers";

/** Searchable single-select (shadcn Popover + Command): a trigger showing the
 *  current label and a filterable option list. Used for long lists such as
 *  provider model ids. */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  mono = true,
  ariaLabel,
  className,
}: {
  value: string;
  onChange?: (value: string) => void;
  options: readonly SelectOption[];
  /** Search box placeholder. */
  placeholder?: string;
  mono?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const t = useTranslations("common.ui");
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => optionValue(o) === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={!onChange}
          className={cn(
            "flex h-9.5 w-full cursor-pointer items-center gap-2 rounded-[7px] border border-input bg-elevated px-3 text-left text-base outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-60",
            className,
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate", mono && "mono text-sm")}>
            {current ? optionLabel(current) : value}
          </span>
          <Icon.ChevronsUpDown size={14} className="shrink-0 text-subtle-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-60 p-0">
        <Command>
          <CommandInput placeholder={placeholder ?? t("searchPlaceholder")} />
          <CommandList className="max-h-70">
            <CommandEmpty>{t("noMatches")}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const v = optionValue(o);
                return (
                  <CommandItem
                    key={v}
                    value={`${optionLabel(o)} ${v}`}
                    onSelect={() => {
                      onChange?.(v);
                      setOpen(false);
                    }}
                    className={cn(mono && "mono text-sm")}
                  >
                    <span className="min-w-0 flex-1 truncate">{optionLabel(o)}</span>
                    {v === value && <Icon.Check className="text-primary" aria-hidden />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
