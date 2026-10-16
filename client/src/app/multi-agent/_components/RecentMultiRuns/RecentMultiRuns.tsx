/* RecentMultiRuns — past multi-agent runs, newest first, each linking to its
   results page. Renders nothing while there are none. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { MultiAgentRunSummary } from "@devdigest/shared";

const STATUS_KEY: Record<MultiAgentRunSummary["status"], string> = {
  queued: "queued",
  running: "running",
  done: "completed",
  failed: "failed",
  cancelled: "cancelled",
};

const META = "text-xs whitespace-nowrap text-subtle-foreground";

export function RecentMultiRuns({ runs }: { runs: MultiAgentRunSummary[] }) {
  const t = useTranslations("runs.multiAgent.configure.recent");
  if (runs.length === 0) return null;
  return (
    <section>
      <h2 className="mt-0 mb-2.5 text-base font-semibold text-foreground">{t("title")}</h2>
      <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-1.5 p-0">
        {runs.map((r) => (
          <li key={r.id}>
            <Link
              href={`/multi-agent/${r.id}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-elevated px-3 py-2.25 text-sm text-foreground no-underline"
            >
              <span className="min-w-0 flex-1 wrap-anywhere">
                {r.pr_number != null ? t("item", { number: r.pr_number, title: r.pr_title ?? "" }) : (r.pr_title ?? r.id)}
              </span>
              <span className={META}>{t("agents", { count: r.agent_count })}</span>
              <span className={META}>{t(`status.${STATUS_KEY[r.status]}`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
