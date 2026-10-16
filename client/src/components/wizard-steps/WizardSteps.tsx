/* WizardSteps — horizontal numbered step indicator for export/publish wizards. */
import React from "react";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

export function WizardSteps({ step, labels }: { step: number; labels: string[] }) {
  return (
    <ol className="flex items-center px-1.25">
      {labels.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <React.Fragment key={i}>
            <li className="flex items-center gap-2.5" aria-current={current ? "step" : undefined}>
              <div
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                  done && "bg-ok text-white",
                  current && "bg-primary text-primary-foreground",
                  !done && !current && "border border-border-strong bg-elevated text-subtle-foreground",
                )}
              >
                {done ? <Icon.Check size={13} aria-hidden /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-sm whitespace-nowrap",
                  current ? "font-semibold" : "font-medium",
                  i <= step ? "text-foreground" : "text-subtle-foreground",
                )}
              >
                {label}
              </span>
            </li>
            {i < labels.length - 1 && (
              <li
                aria-hidden
                className={cn("mx-3.5 h-px min-w-6 flex-1", done ? "bg-ok" : "bg-border-strong")}
              />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}
