import type { Severity } from "@/components/severity";

/** Left accent stripe of a compact finding card, per severity. */
export const SEVERITY_STRIPE: Record<Severity, string> = {
  CRITICAL: "border-l-crit",
  WARNING: "border-l-warn",
  SUGGESTION: "border-l-sugg",
  INFO: "border-l-info",
};
