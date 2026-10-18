import type { Severity } from "@devdigest/shared";

/** Confidence below this is hidden when "hide low confidence" is on. */
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

/** Display order for the severity-filter pills (most to least severe). */
export const SEVERITY_FILTER_ORDER: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];
