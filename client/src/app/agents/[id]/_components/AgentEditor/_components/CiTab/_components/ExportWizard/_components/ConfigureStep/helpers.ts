import type { CiTrigger } from "@devdigest/shared";
import { ALL_TRIGGERS } from "../../constants";

/** Flip one trigger, keeping the canonical opened/synchronize/reopened order. */
export function toggleTrigger(current: CiTrigger[], trigger: CiTrigger): CiTrigger[] {
  const next = current.includes(trigger) ? current.filter((t) => t !== trigger) : [...current, trigger];
  return ALL_TRIGGERS.filter((t) => next.includes(t));
}
