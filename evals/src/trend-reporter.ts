/**
 * Local version-over-version trend. A tiny vitest reporter that appends each eval test's
 * pass/fail (with the current git sha) to results/history.jsonl. Both `eval:compare` and
 * `eval:repeat` read this file, so removing the reporter disables both — it is not optional
 * if you use those. Nothing here calls a model.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Reporter, TestModule } from "vitest/node";

const HERE = dirname(fileURLToPath(import.meta.url));
const HISTORY = join(HERE, "..", "results", "history.jsonl");

function gitSha(): string {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return "unknown";
  }
}

export default class TrendReporter implements Reporter {
  private runId = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  private sha = gitSha();

  // vitest ≥ 4 replaced `onFinished(files)` with `onTestRunEnd(testModules)`. The row
  // format (`<file> > <test name>`, pass/fail) is unchanged so existing history still compares.
  onTestRunEnd(testModules: ReadonlyArray<TestModule>) {
    const rows: string[] = [];
    for (const mod of testModules) {
      for (const test of mod.children.allTests()) {
        const state = test.result().state;
        // Only record tests that actually ran (pass/fail) — skips add noise to the trend.
        if (state !== "passed" && state !== "failed") continue;
        rows.push(
          JSON.stringify({
            run_id: this.runId,
            git_sha: this.sha,
            nodeid: `${mod.relativeModuleId} > ${test.name}`,
            outcome: state === "passed" ? "pass" : "fail",
          }),
        );
      }
    }
    if (!rows.length) return;
    mkdirSync(dirname(HISTORY), { recursive: true });
    appendFileSync(HISTORY, rows.join("\n") + "\n");
  }
}
