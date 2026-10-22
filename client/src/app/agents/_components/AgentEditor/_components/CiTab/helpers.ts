import type { CiInstallation, CiPostAs, CiTrigger } from "@devdigest/shared";
import type { WizardInitial } from "./_components/ExportWizard/helpers";

const TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize", "reopened"];
const POST_AS: readonly CiPostAs[] = ["github_review", "pr_comment", "none"];

/** Wizard pre-fill ("Update CI config"): the first out-of-date installation,
 *  else the first one - its repo, target, triggers, post_as and Jenkins settings. */
export function wizardPrefill(installations: CiInstallation[]): WizardInitial {
  const inst = installations.find((i) => i.out_of_date) ?? installations[0];
  if (!inst) return {};
  return installationPrefill(inst);
}

/** Pre-fill from one installation (row "Update CI config", CI Runs "Re-export"). */
export function installationPrefill(inst: CiInstallation): WizardInitial {
  const triggers = (inst.triggers ?? []).filter((t): t is CiTrigger => TRIGGERS.some((x) => x === t));
  const postAs = POST_AS.find((p) => p === inst.post_as);
  const jenkins = inst.target_type === "jenkins";
  return {
    repo: inst.repo,
    target: jenkins ? "jenkins" : "gha",
    ...(triggers.length > 0 ? { triggers } : {}),
    ...(postAs ? { post_as: postAs } : {}),
    ...(jenkins
      ? {
          jenkins: {
            ...(inst.ci_job_name ? { job_name: inst.ci_job_name } : {}),
            ...(inst.openrouter_credential_id ? { openrouter_credential_id: inst.openrouter_credential_id } : {}),
            ...(inst.github_credential_id ? { github_credential_id: inst.github_credential_id } : {}),
            ...(inst.agent_label ? { agent_label: inst.agent_label } : {}),
          },
          ...(inst.scan_credential_id ? { scan_credential_id: inst.scan_credential_id } : {}),
        }
      : {}),
  };
}
