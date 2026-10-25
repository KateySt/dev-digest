import {
  CI_JENKINS_AGENT_LABEL_RE,
  CI_JENKINS_CREDENTIAL_ID_RE,
  CI_JENKINS_JOB_NAME_RE,
  type CiExportInputBody,
  type CiLintViolation,
  type CiPostAs,
  type CiPreview,
  type CiPreviewFile,
  type CiTrigger,
} from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import {
  DEFAULT_SCAN_CREDENTIAL_ID,
  JENKINSFILE_PATH,
  JENKINS_DEFAULTS,
  WORKFLOW_PATH,
  type ExportTarget,
  type JenkinsFields,
  triggersFor,
} from "./constants";

/** `owner/name` — one slash, no spaces, both halves non-empty (C-AC-12). */
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export function isRepo(value: string): boolean {
  return REPO_RE.test(value.trim());
}

export type InstallMethod = "pr" | "zip";

export interface WizardState {
  /** 0 = Target, 1 = Preview, 2 = Configure, 3 = Install. */
  step: number;
  target: ExportTarget;
  triggers: CiTrigger[];
  postAs: CiPostAs;
  /** Jenkins only: job name, credential IDs, agent label. */
  jenkins: JenkinsFields;
  /** Jenkins only: also create the multibranch job on export. */
  createJob: boolean;
  scanCredentialId: string;
  preview: CiPreview | null;
  /** Pipeline text (workflow or Jenkinsfile) the server generated - what `workflowDraft` is compared against. */
  generatedWorkflow: string | null;
  /** The user's edited pipeline text, or null while it is the generated one. */
  workflowDraft: string | null;
  violations: CiLintViolation[];
  /** Error from the last preview call (shown on the step that triggered it). */
  error: string | null;
  /** C-AC-36: the repo already uses this other target (409 `ci_target_conflict`). */
  conflict: { repo: string; target: string } | null;
  /** True when a regenerating change threw away a manual pipeline edit. */
  editsDiscarded: boolean;
}

export type WizardAction =
  | { type: "previewLoaded"; preview: CiPreview; step?: number; fromEdits: boolean }
  | { type: "previewFailed"; error: string; violations?: CiLintViolation[]; conflict?: WizardState["conflict"] }
  | { type: "setStep"; step: number }
  | { type: "setTarget"; target: ExportTarget }
  | { type: "editWorkflow"; text: string }
  | { type: "setTriggers"; triggers: CiTrigger[] }
  | { type: "setPostAs"; postAs: CiPostAs }
  | { type: "setJenkins"; patch: Partial<JenkinsFields> }
  | { type: "setCreateJob"; createJob: boolean }
  | { type: "setScanCredentialId"; value: string };

export interface WizardInitial {
  repo?: string;
  target?: ExportTarget;
  triggers?: CiTrigger[];
  post_as?: CiPostAs;
  jenkins?: Partial<JenkinsFields>;
  scan_credential_id?: string;
}

function defaultTriggers(target: ExportTarget, wanted?: CiTrigger[]): CiTrigger[] {
  const allowed = triggersFor(target);
  const kept = (wanted ?? []).filter((t) => allowed.includes(t));
  return kept.length > 0 ? kept : [...allowed];
}

export function initialState(initial?: WizardInitial): WizardState {
  const target = initial?.target ?? "gha";
  return {
    step: 0,
    target,
    triggers: defaultTriggers(target, initial?.triggers),
    postAs: initial?.post_as ?? "github_review",
    jenkins: { ...JENKINS_DEFAULTS, ...initial?.jenkins },
    createJob: false,
    scanCredentialId: initial?.scan_credential_id ?? DEFAULT_SCAN_CREDENTIAL_ID,
    preview: null,
    generatedWorkflow: null,
    workflowDraft: null,
    violations: [],
    error: null,
    conflict: null,
    editsDiscarded: false,
  };
}

/** Changing these regenerates the Jenkinsfile, so a manual edit cannot survive (Q5c). */
const REGENERATING: readonly (keyof JenkinsFields)[] = ["openrouter_credential_id", "github_credential_id", "agent_label"];

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "previewLoaded":
      return {
        ...state,
        preview: action.preview,
        // A preview built from the user's edit says nothing new about the generated text.
        generatedWorkflow: action.fromEdits ? state.generatedWorkflow : (workflowFile(action.preview)?.contents ?? null),
        workflowDraft: action.fromEdits ? state.workflowDraft : null,
        step: action.step ?? state.step,
        violations: [],
        error: null,
        conflict: null,
      };
    case "previewFailed":
      return { ...state, error: action.error, violations: action.violations ?? [], conflict: action.conflict ?? null };
    case "setStep":
      return { ...state, step: action.step, error: null };
    case "setTarget":
      if (action.target === state.target) return state;
      return {
        ...state,
        target: action.target,
        triggers: defaultTriggers(action.target, state.triggers),
        preview: null,
        generatedWorkflow: null,
        workflowDraft: null,
        violations: [],
        error: null,
        conflict: null,
        editsDiscarded: false,
      };
    case "editWorkflow":
      return { ...state, workflowDraft: action.text, violations: [] };
    case "setTriggers":
      // The pipeline is generated from the triggers, so a manual edit cannot survive.
      return {
        ...state,
        triggers: action.triggers,
        editsDiscarded: state.editsDiscarded || isEdited(state),
        workflowDraft: null,
      };
    case "setPostAs":
      return { ...state, postAs: action.postAs };
    case "setJenkins": {
      const regenerates = REGENERATING.some((k) => k in action.patch && action.patch[k] !== state.jenkins[k]);
      return {
        ...state,
        jenkins: { ...state.jenkins, ...action.patch },
        ...(regenerates ? { editsDiscarded: state.editsDiscarded || isEdited(state), workflowDraft: null } : {}),
      };
    }
    case "setCreateJob":
      return { ...state, createJob: action.createJob };
    case "setScanCredentialId":
      return { ...state, scanCredentialId: action.value };
  }
}

/** The one editable pipeline file (workflow or Jenkinsfile). */
export function workflowFile(preview: CiPreview | null): CiPreviewFile | undefined {
  return preview?.files.find((f) => f.path === WORKFLOW_PATH || f.path === JENKINSFILE_PATH);
}

/** True when the user changed the pipeline text away from the generated one. */
export function isEdited(state: Pick<WizardState, "generatedWorkflow" | "workflowDraft">): boolean {
  return state.workflowDraft !== null && state.workflowDraft !== state.generatedWorkflow;
}

/** Which Jenkins fields fail the shared contract regexes (S-AC-48, C-AC-39). */
export function jenkinsFieldErrors(fields: JenkinsFields): Partial<Record<keyof JenkinsFields, true>> {
  const out: Partial<Record<keyof JenkinsFields, true>> = {};
  if (fields.job_name.length > 200 || !CI_JENKINS_JOB_NAME_RE.test(fields.job_name)) out.job_name = true;
  if (!CI_JENKINS_CREDENTIAL_ID_RE.test(fields.openrouter_credential_id)) out.openrouter_credential_id = true;
  if (!CI_JENKINS_CREDENTIAL_ID_RE.test(fields.github_credential_id)) out.github_credential_id = true;
  if (!CI_JENKINS_AGENT_LABEL_RE.test(fields.agent_label)) out.agent_label = true;
  return out;
}

export function isCredentialId(value: string): boolean {
  return CI_JENKINS_CREDENTIAL_ID_RE.test(value);
}

/** Request body for preview / export / zip. */
export function toInput(
  repo: string,
  state: Pick<
    WizardState,
    "target" | "triggers" | "postAs" | "generatedWorkflow" | "workflowDraft" | "jenkins" | "createJob" | "scanCredentialId"
  >,
  opts: { withEdits: boolean; createJob?: boolean },
): CiExportInputBody {
  const base = {
    repo: repo.trim(),
    target: state.target,
    action: "open_pr" as const,
    post_as: state.postAs,
    triggers: state.triggers,
  };
  const edited = opts.withEdits && isEdited(state) ? state.workflowDraft : null;
  if (state.target === "gha") return { ...base, ...(edited ? { workflow_yaml: edited } : {}) };
  const withJob = !!opts.createJob && state.createJob;
  return {
    ...base,
    jenkins: { ...state.jenkins, ...(withJob ? { scan_credential_id: state.scanCredentialId.trim() } : {}) },
    ...(edited ? { jenkinsfile: edited } : {}),
    ...(withJob ? { create_jenkins_job: true } : {}),
  };
}

/** C-AC-36: a 409 `ci_target_conflict` names the target the repo already uses. */
export function targetConflictFromError(err: unknown, repo: string): WizardState["conflict"] {
  if (!(err instanceof ApiError) || err.code !== "ci_target_conflict") return null;
  const target = (err.details as { existing_target?: unknown } | undefined)?.existing_target;
  return { repo, target: typeof target === "string" ? target : "" };
}

/** Runner entries carry `metadata` and never a body (C-AC-14). */
export function isRunnerFile(file: CiPreviewFile): boolean {
  return file.metadata != null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Lint violations ride along on a 422's `details` (C-AC-17). */
export function violationsFromError(err: unknown): CiLintViolation[] {
  if (!(err instanceof ApiError) || err.status !== 422) return [];
  const details = err.details as { violations?: unknown } | undefined;
  if (!Array.isArray(details?.violations)) return [];
  return details.violations.filter(
    (v): v is CiLintViolation =>
      typeof v === "object" &&
      v !== null &&
      typeof (v as CiLintViolation).rule === "string" &&
      typeof (v as CiLintViolation).location === "string" &&
      typeof (v as CiLintViolation).message === "string",
  );
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Save a Blob through a temporary link (the zip download). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
