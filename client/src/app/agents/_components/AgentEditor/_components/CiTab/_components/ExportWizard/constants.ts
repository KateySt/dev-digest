import type { IconName } from "@/components/icon";
import type { CiPostAs, CiTrigger } from "@devdigest/shared";

export const STEP_KEYS = ["target", "preview", "configure", "install"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export interface TargetOption {
  id: "gha" | "circle" | "jenkins" | "cli";
  icon: IconName;
  /** GitHub Actions and Jenkins are implemented; the others are "Coming soon" stubs. */
  disabled: boolean;
}

export const TARGETS: readonly TargetOption[] = [
  { id: "gha", icon: "Workflow", disabled: false },
  { id: "circle", icon: "RefreshCw", disabled: true },
  { id: "jenkins", icon: "Settings", disabled: false },
  { id: "cli", icon: "Command", disabled: true },
];

/** The targets the wizard can export to. */
export type ExportTarget = "gha" | "jenkins";

export const ALL_TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize", "reopened"];
/** Jenkins has no reopen signal (S-AC-49). */
export const JENKINS_TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize"];

export function triggersFor(target: ExportTarget): readonly CiTrigger[] {
  return target === "jenkins" ? JENKINS_TRIGGERS : ALL_TRIGGERS;
}

/** Jenkins settings the wizard edits (repo-wide on the server). */
export interface JenkinsFields {
  job_name: string;
  openrouter_credential_id: string;
  github_credential_id: string;
  agent_label: string;
}

/** Defaults of `CiJenkinsInput` (S-AC-48). */
export const JENKINS_DEFAULTS: JenkinsFields = {
  job_name: "devdigest-review",
  openrouter_credential_id: "devdigest-openrouter-api-key",
  github_credential_id: "devdigest-github-token",
  agent_label: "any",
};
export const DEFAULT_SCAN_CREDENTIAL_ID = "devdigest-github-scan";

export const POST_AS_OPTIONS: readonly { value: CiPostAs; labelKey: "githubReview" | "prComment" | "none" }[] = [
  { value: "github_review", labelKey: "githubReview" },
  { value: "pr_comment", labelKey: "prComment" },
  { value: "none", labelKey: "none" },
];

/** Paths the server generates (S-AC-1). */
export const WORKFLOW_PATH = ".github/workflows/devdigest-review.yml";
export const JENKINSFILE_PATH = "Jenkinsfile";

/** Branch and PR title the export uses (shown on the Install step). */
export const CI_BRANCH = "devdigest/ci";
export const PR_TITLE = "Add DevDigest CI review";

/** Secrets the workflow expects the repo to hold (status is never read). */
export const EXPECTED_SECRETS = ["OPENROUTER_API_KEY", "GITHUB_TOKEN"] as const;

export const DOCS_URL = "https://docs.github.com/en/actions";
export const JENKINS_DOCS_URL = "https://www.jenkins.io/doc/book/pipeline/multibranch/";
