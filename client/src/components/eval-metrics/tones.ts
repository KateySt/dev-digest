import type { DeltaDirection, MetricKey } from "@/lib/eval";

/** Utility classes per metric — the same colour everywhere (tiles, cards,
 *  legends, table bars): recall = brand, precision = ok, citation = warn.
 *  SVG charts keep using `METRICS[].color` (an SVG attribute, not a class). */
export const METRIC_TONE: Record<MetricKey, { text: string; bg: string }> = {
  recall: { text: "text-primary", bg: "bg-primary" },
  precision: { text: "text-ok", bg: "bg-ok" },
  citation_accuracy: { text: "text-warn", bg: "bg-warn" },
};

/** Delta colour class: rise green, drop red, flat muted. `invert` flips it for
 *  cost (a rise is bad). */
export function deltaTone(direction: DeltaDirection, invert = false): string {
  if (direction === "flat") return "text-subtle-foreground";
  const good = invert ? direction === "down" : direction === "up";
  return good ? "text-ok" : "text-crit";
}
