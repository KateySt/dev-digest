import type { IconName } from "@devdigest/ui";
import type { CiPostAs, CiTrigger } from "@devdigest/shared";

export const STEP_KEYS = ["target", "preview", "configure", "install"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export interface TargetOption {
  id: "gha" | "circle" | "jenkins" | "cli";
  icon: IconName;
  /** Only GitHub Actions is implemented; the others are "Coming soon" stubs. */
  disabled: boolean;
}

export const TARGETS: readonly TargetOption[] = [
  { id: "gha", icon: "Workflow", disabled: false },
  { id: "circle", icon: "RefreshCw", disabled: true },
  { id: "jenkins", icon: "Settings", disabled: true },
  { id: "cli", icon: "Command", disabled: true },
];

export const ALL_TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize", "reopened"];

export const POST_AS_OPTIONS: readonly { value: CiPostAs; labelKey: "githubReview" | "prComment" | "none" }[] = [
  { value: "github_review", labelKey: "githubReview" },
  { value: "pr_comment", labelKey: "prComment" },
  { value: "none", labelKey: "none" },
];

/** Paths the server generates (S-AC-1). */
export const WORKFLOW_PATH = ".github/workflows/devdigest-review.yml";

/** Branch and PR title the export uses (shown on the Install step). */
export const CI_BRANCH = "devdigest/ci";
export const PR_TITLE = "Add DevDigest CI review";

/** Secrets the workflow expects the repo to hold (status is never read). */
export const EXPECTED_SECRETS = ["OPENROUTER_API_KEY", "GITHUB_TOKEN"] as const;

export const DOCS_URL = "https://docs.github.com/en/actions";
