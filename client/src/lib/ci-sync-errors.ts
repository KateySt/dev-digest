import type { CiSyncErrorCode } from "@devdigest/shared";

/** What the "Fix" button does for a Jenkins sync error (C-AC-52). */
export type CiSyncFixAction = "connect" | "edit" | "reexport";

const ACTIONS: Record<CiSyncErrorCode, CiSyncFixAction> = {
  jenkins_not_configured: "connect",
  jenkins_connection_mismatch: "edit",
  jenkins_auth_failed: "edit",
  jenkins_unreachable: "edit",
  jenkins_job_not_found: "reexport",
};

export function isCiSyncErrorCode(code: string | null | undefined): code is CiSyncErrorCode {
  return !!code && code in ACTIONS;
}

/** i18n keys (namespace `ci.jenkins.syncErrors`) + action for one error code. */
export function ciSyncErrorView(code: CiSyncErrorCode): {
  whatKey: `${CiSyncErrorCode}.what`;
  fixKey: `${CiSyncErrorCode}.fix`;
  actionKey: `actions.${CiSyncFixAction}`;
  action: CiSyncFixAction;
} {
  const action = ACTIONS[code];
  return { whatKey: `${code}.what`, fixKey: `${code}.fix`, actionKey: `actions.${action}`, action };
}

/** Deep link that opens the agent's CI tab with the wizard pre-filled (Q4). */
export function reexportHref(agentId: string, installationId: string): string {
  const params = new URLSearchParams({ agent: agentId, tab: "ci", reexport: installationId });
  return `/agents?${params.toString()}`;
}
