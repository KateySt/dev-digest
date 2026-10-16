
export type ResultsView = "columns" | "tabs";

export const VIEW_PARAM = "view";
export const TRACE_PARAM = "trace";
export const DEFAULT_VIEW: ResultsView = "columns";

/** How often a running column's elapsed counter re-renders. */
export const ELAPSED_TICK_MS = 1000;
