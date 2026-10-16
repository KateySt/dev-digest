export interface LogLine {
  t: string;
  k: "info" | "result" | "tool" | "error";
  m: string;
}

/** Text colour per log-line kind. */
export const LOG_KIND_CLASS: Record<LogLine["k"], string> = {
  info: "text-brand-text",
  result: "text-ok",
  tool: "text-warn",
  error: "text-crit",
};
