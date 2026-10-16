/* Shared class names for the Agents / Skills overview tabs. Names wrap, never
   overflow (client/INSIGHTS.md 2026-09-24). */

const WRAP = "min-w-0 break-words wrap-anywhere";

export const C = {
  header: "mb-5.5 flex items-start gap-3.5",
  headerText: "min-w-0 flex-1",
  h1: "text-5xl font-bold tracking-[-0.02em]",
  subtitle: "mt-1.5 text-base text-muted-foreground",
  notice: "mb-3 text-sm text-subtle-foreground",
  sectionLabel:
    "mt-0 mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.07em] text-subtle-foreground uppercase",
  list: "mb-7.5 flex flex-col gap-2.5",
  card: "flex items-center gap-4 rounded-xl border border-border bg-elevated px-4.5 py-3.5 text-inherit no-underline",
  iconTile: "grid size-9.5 shrink-0 place-items-center rounded-[9px] bg-brand-bg text-primary",
  main: "min-w-0 flex-1",
  titleRow: "flex flex-wrap items-center gap-2.5",
  name: `text-lg font-bold ${WRAP}`,
  modelChip: `mono rounded-[5px] bg-muted px-2 py-px text-[11.5px] text-subtle-foreground ${WRAP}`,
  meta: `mt-0.75 text-sm text-subtle-foreground ${WRAP}`,
  runningNote: "font-semibold text-brand-text",
  metrics: "flex shrink-0 gap-5.5",
  metric: "flex min-w-13.5 flex-col items-start gap-0.5",
  metricLabel: "text-[10.5px] font-bold tracking-[0.06em] text-subtle-foreground",
  sparkWrap: "flex w-22.5 shrink-0 justify-center",
  chevron: "shrink-0 text-subtle-foreground",
  tableWrap: "overflow-x-auto rounded-xl border border-border bg-elevated",
  table: "w-full border-collapse",
  th: "border-b border-border px-3.5 py-3 text-left text-2xs font-bold tracking-[0.05em] whitespace-nowrap text-subtle-foreground uppercase",
  td: "border-b border-border px-3.5 py-2.75 align-middle text-sm text-muted-foreground",
  tdName: `font-semibold text-foreground ${WRAP}`,
  tdVersion: "text-primary",
  tdPass: "font-bold text-foreground",
  muted: "px-3.5 py-4.5 text-[13.5px] text-subtle-foreground",
} as const;
