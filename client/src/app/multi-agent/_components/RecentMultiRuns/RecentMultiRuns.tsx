/* RecentMultiRuns — past multi-agent runs, newest first, each linking to its
   results page. Renders nothing while there are none. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { MultiAgentRunSummary } from "@devdigest/shared";
import { s } from "./styles";

const STATUS_KEY: Record<MultiAgentRunSummary["status"], string> = {
  queued: "queued",
  running: "running",
  done: "completed",
  failed: "failed",
  cancelled: "cancelled",
};

export function RecentMultiRuns({ runs }: { runs: MultiAgentRunSummary[] }) {
  const t = useTranslations("runs.multiAgent.configure.recent");
  if (runs.length === 0) return null;
  return (
    <section>
      <h2 style={s.title}>{t("title")}</h2>
      <ul style={s.list}>
        {runs.map((r) => (
          <li key={r.id}>
            <Link href={`/multi-agent/${r.id}`} style={s.row}>
              <span style={s.label}>
                {r.pr_number != null ? t("item", { number: r.pr_number, title: r.pr_title ?? "" }) : (r.pr_title ?? r.id)}
              </span>
              <span style={s.meta}>{t("agents", { count: r.agent_count })}</span>
              <span style={s.meta}>{t(`status.${STATUS_KEY[r.status]}`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
