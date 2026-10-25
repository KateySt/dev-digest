import type { JenkinsConnectionTestResult } from "@devdigest/shared";

type Translate = (key: string, values?: Record<string, string>) => string;

/** One line for the Test result (`aria-live`); unknown codes fall back to the server text. */
export function testResultMessage(res: JenkinsConnectionTestResult, t: Translate): string {
  if (res.ok) return t("testOk", { version: res.version ?? "?", user: res.user ?? "?" });
  if (res.code) return t(`testCodes.${res.code}`);
  return res.message ?? "";
}
