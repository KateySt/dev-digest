/* Latest docs-check runs: per-repo status, expandable findings, "Run now". */
"use client";

import { useLocale, useTranslations } from "next-intl";
import type { DocSyncRepoResult, DocSyncRun } from "@devdigest/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatWhen } from "../../helpers";

const RUN_VARIANT = { running: "info", done: "ok", failed: "crit" } as const;
const REPO_VARIANT = { pending: "neutral", unchanged: "neutral", up_to_date: "ok", stale: "warn", failed: "crit" } as const;

export function DocSyncRuns({
  runs,
  canRun,
  starting,
  onRunNow,
}: {
  runs: DocSyncRun[];
  canRun: boolean;
  starting: boolean;
  onRunNow: () => void;
}) {
  const t = useTranslations("settings.docSync");
  const locale = useLocale();
  const running = runs.some((r) => r.status === "running");

  return (
    <section>
      <div className="mb-3 flex items-center">
        <h3 className="text-lg font-semibold">{t("runsTitle")}</h3>
        <Button className="ml-auto" variant="secondary" disabled={!canRun || running || starting} onClick={onRunNow}>
          {running ? t("running") : t("runNow")}
        </Button>
      </div>
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("runsEmpty")}</p>
      ) : (
        <ul className="space-y-3">
          {runs.map((run) => (
            <li key={run.id} className="rounded-md border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-foreground">{formatWhen(run.started_at, locale)}</span>
                <span className="text-muted-foreground">{t(`trigger.${run.trigger}`)}</span>
                <Badge variant={RUN_VARIANT[run.status]} className="ml-auto">
                  {t(`runStatus.${run.status}`)}
                </Badge>
              </div>
              <ul className="mt-2 space-y-1">
                {run.results.map((r) => (
                  <RepoResult key={r.repo_id} result={r} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RepoResult({ result }: { result: DocSyncRepoResult }) {
  const t = useTranslations("settings.docSync");
  const problems = result.findings_total + result.issues.length;
  const inPr = result.pr_action === "opened" || result.pr_action === "updated";
  const label = result.status === "stale" ? t("repoStatus.stale", { count: problems }) : t(`repoStatus.${result.status}`);
  const head = (
    <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
      <span className="mono truncate text-foreground">{result.repo_full_name}</span>
      {result.docs_scanned > 0 && (
        <span className="text-xs text-subtle-foreground">{t("docsScanned", { count: result.docs_scanned })}</span>
      )}
      <Badge variant={REPO_VARIANT[result.status]} className="ml-auto shrink-0">
        {label}
      </Badge>
    </span>
  );

  if (result.status === "failed") {
    return (
      <li>
        {head}
        {result.error && <p className="mt-0.5 text-xs text-crit">{result.error}</p>}
      </li>
    );
  }
  return (
    <li>
      {problems === 0 ? (
        <div className="flex">{head}</div>
      ) : (
        <details>
          <summary className="flex cursor-pointer list-none">{head}</summary>
          <ul className="mt-1.5 space-y-0.5 border-l border-border pl-3 text-xs">
            {result.issues.map((i) => (
              <li key={`${i.path}:${i.claim}`} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground">
                  {!i.fixed ? t("issueOpen") : inPr ? t("issueFixed") : t("issueDrafted")}
                </span>
                <span className="mono shrink-0 text-foreground">{i.path}</span>
                <span className="min-w-0 truncate text-subtle-foreground" title={`${i.claim} → ${i.problem}`}>
                  {i.problem}
                </span>
              </li>
            ))}
            {result.findings.map((f) => (
              <li key={`${f.path}:${f.line}:${f.kind}:${f.target}`} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground">{t(`findingKind.${f.kind}`)}</span>
                <span className="mono min-w-0 truncate text-foreground" title={`${f.path}:${f.line}`}>
                  {f.path}:{f.line}
                </span>
                <span className="mono min-w-0 truncate text-subtle-foreground">{f.target}</span>
              </li>
            ))}
            {result.findings_total > result.findings.length && (
              <li className="text-subtle-foreground">
                {t("moreFindings", { count: result.findings_total - result.findings.length })}
              </li>
            )}
          </ul>
        </details>
      )}
      <PrLine result={result} />
    </li>
  );
}

/** What happened with the docs PR, plus the LLM cost of the review. */
function PrLine({ result }: { result: DocSyncRepoResult }) {
  const t = useTranslations("settings.docSync");
  const cost = result.cost_usd !== null && result.cost_usd > 0 ? t("cost", { usd: result.cost_usd.toFixed(3) }) : null;
  const action = result.pr_action;
  if (!action && !cost) return null;
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-subtle-foreground">
      {action && action !== "none" && (
        <span className={action === "failed" || action === "branch_moved" ? "text-warn" : undefined}>
          {t(`prAction.${action}`, { count: result.docs_updated })}
        </span>
      )}
      {result.pr_url && (
        <a href={result.pr_url} target="_blank" rel="noopener noreferrer" className="text-brand-text">
          {t("openPr")}
        </a>
      )}
      {result.pr_error && <span title={result.pr_error} className="min-w-0 truncate">{result.pr_error}</span>}
      {cost && <span className="ml-auto">{cost}</span>}
    </p>
  );
}
