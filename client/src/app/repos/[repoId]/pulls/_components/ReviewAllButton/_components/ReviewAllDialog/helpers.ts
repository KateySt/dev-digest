import type { ReviewEstimate } from "@devdigest/shared";
import { BULK_REVIEW_MAX_PRS } from "../../constants";

export type EstimateView = "noPrs" | "tooMany" | "noAgents" | "allInFlight" | "ready";

/** Which confirm-dialog state an estimate maps to. Order matters: an empty set
 *  and a zero-agent set read differently (the fix is a PR vs. configuring an
 *  agent), and over-cap refuses before anything else is offered. */
export function estimateView(e: ReviewEstimate): EstimateView {
  if (e.pr_count === 0) return "noPrs";
  if (e.pr_count > BULK_REVIEW_MAX_PRS) return "tooMany";
  if (e.agent_count === 0 || e.run_count === 0) return "noAgents";
  if (e.skip_count >= e.pr_count) return "allInFlight";
  return "ready";
}
