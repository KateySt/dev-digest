import type { CiInstallation, CiPostAs, CiTrigger } from "@devdigest/shared";

const TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize", "reopened"];
const POST_AS: readonly CiPostAs[] = ["github_review", "pr_comment", "none"];

/** Wizard pre-fill ("Update CI config"): the first out-of-date installation,
 *  else the first one - its repo, triggers and post_as. */
export function wizardPrefill(installations: CiInstallation[]): {
  repo?: string;
  triggers?: CiTrigger[];
  post_as?: CiPostAs;
} {
  const inst = installations.find((i) => i.out_of_date) ?? installations[0];
  if (!inst) return {};
  const triggers = (inst.triggers ?? []).filter((t): t is CiTrigger => TRIGGERS.some((x) => x === t));
  const postAs = POST_AS.find((p) => p === inst.post_as);
  return {
    repo: inst.repo,
    ...(triggers.length > 0 ? { triggers } : {}),
    ...(postAs ? { post_as: postAs } : {}),
  };
}
