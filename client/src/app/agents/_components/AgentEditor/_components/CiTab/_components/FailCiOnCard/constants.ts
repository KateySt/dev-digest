import type { CiFailOn } from "@devdigest/shared";

/** The three segments and the `ci_fail_on` value each one stores. */
export const SEGMENTS: readonly { value: Extract<CiFailOn, "critical" | "warning" | "never"> }[] = [
  { value: "critical" },
  { value: "warning" },
  { value: "never" },
];
