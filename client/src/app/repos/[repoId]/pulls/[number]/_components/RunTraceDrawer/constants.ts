/** Constants for the Run Trace + Live Log drawer (A5). */

/** Live-log stream viewport height (px). */
export const LOG_HEIGHT = 420;

/** Tab keys (Trace / Live log). */
export const TABS = ["trace", "log"] as const;
export type TraceTab = (typeof TABS)[number];

/** Prompt-assembly block accent dot (by leg). */
export const PROMPT_DOT = {
  system: "bg-subtle-foreground",
  skills: "bg-primary",
  memory: "bg-warn",
  repoMap: "bg-primary",
  specs: "bg-muted-foreground",
  callers: "bg-warn",
  user: "bg-ok",
} as const;
