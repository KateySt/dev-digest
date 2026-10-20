
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

export type TabDef = string | { key: string; label: string; icon?: IconName; count?: number };

/** Underlined page/section tabs (PR detail, editors). Click-activated buttons
 *  with tablist/tab semantics. Not Radix Tabs: callers own the panels and
 *  switch on click, and Radix activates on mousedown/focus instead. */
export function PageTabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: TabDef[];
  value: string;
  onChange: (key: string) => void;
  /** Usually horizontal padding (e.g. `px-7`). */
  className?: string;
}) {
  return (
    <div
      role="tablist"
      // Inset shadow instead of a border: the active underline paints over it
      // without a negative margin, so nothing overflows vertically. The strip
      // is its own container: in a narrow pane (an editor beside a list at the
      // 1024px desktop minimum) tabs drop their icons and tighten instead of
      // scrolling sideways.
      className={cn("@container/tabs flex gap-0.5 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)]", className)}
    >
      {tabs.map((t) => {
        const key = typeof t === "string" ? t : t.key;
        const label = typeof t === "string" ? t : t.label;
        const icon = typeof t === "object" ? t.icon : undefined;
        const count = typeof t === "object" ? t.count : undefined;
        const on = value === key;
        const I = icon ? Icon[icon] : null;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(key)}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-2 border-0 border-b-2 bg-transparent px-2.5 py-3 text-sm whitespace-nowrap transition-colors @min-[600px]/tabs:px-4 @min-[600px]/tabs:text-base",
              on
                ? "border-primary font-semibold text-foreground"
                : "border-transparent font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {I && (
              <I
                size={14}
                className={cn("hidden @min-[600px]/tabs:block", on ? "text-primary" : "text-subtle-foreground")}
                aria-hidden
              />
            )}
            {label}
            {count != null && <span className="tnum text-xs text-subtle-foreground">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
