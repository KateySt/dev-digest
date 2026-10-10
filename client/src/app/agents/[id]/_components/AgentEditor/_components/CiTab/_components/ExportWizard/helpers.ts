import type {
  CiExportInputBody,
  CiLintViolation,
  CiPostAs,
  CiPreview,
  CiPreviewFile,
  CiTrigger,
} from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { ALL_TRIGGERS, WORKFLOW_PATH } from "./constants";

/** `owner/name` — one slash, no spaces, both halves non-empty (C-AC-12). */
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export function isRepo(value: string): boolean {
  return REPO_RE.test(value.trim());
}

export type InstallMethod = "pr" | "zip";

export interface WizardState {
  /** 0 = Target, 1 = Preview, 2 = Configure, 3 = Install. */
  step: number;
  repo: string;
  triggers: CiTrigger[];
  postAs: CiPostAs;
  preview: CiPreview | null;
  /** Workflow text the server generated (no user edits) - what `workflowDraft` is compared against. */
  generatedWorkflow: string | null;
  /** The user's edited workflow text, or null while it is the generated one. */
  workflowDraft: string | null;
  violations: CiLintViolation[];
  /** Error from the last preview call (shown on the step that triggered it). */
  error: string | null;
  /** True when changing triggers threw away a manual workflow edit. */
  editsDiscarded: boolean;
}

export type WizardAction =
  | { type: "setRepo"; repo: string }
  | { type: "previewLoaded"; preview: CiPreview; step?: number; fromEdits: boolean }
  | { type: "previewFailed"; error: string; violations?: CiLintViolation[] }
  | { type: "setStep"; step: number }
  | { type: "editWorkflow"; text: string }
  | { type: "setTriggers"; triggers: CiTrigger[] }
  | { type: "setPostAs"; postAs: CiPostAs };

export function initialState(initial?: {
  repo?: string;
  triggers?: CiTrigger[];
  post_as?: CiPostAs;
}): WizardState {
  return {
    step: 0,
    repo: initial?.repo ?? "",
    triggers: initial?.triggers?.length ? initial.triggers : [...ALL_TRIGGERS],
    postAs: initial?.post_as ?? "github_review",
    preview: null,
    generatedWorkflow: null,
    workflowDraft: null,
    violations: [],
    error: null,
    editsDiscarded: false,
  };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "setRepo":
      return { ...state, repo: action.repo, error: null };
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
      };
    case "previewFailed":
      return { ...state, error: action.error, violations: action.violations ?? [] };
    case "setStep":
      return { ...state, step: action.step, error: null };
    case "editWorkflow":
      return { ...state, workflowDraft: action.text, violations: [] };
    case "setTriggers":
      // The workflow's `on:` block is generated from the triggers, so a manual
      // edit cannot survive a trigger change.
      return {
        ...state,
        triggers: action.triggers,
        editsDiscarded: state.editsDiscarded || isEdited(state),
        workflowDraft: null,
      };
    case "setPostAs":
      return { ...state, postAs: action.postAs };
  }
}

export function workflowFile(preview: CiPreview | null): CiPreviewFile | undefined {
  return preview?.files.find((f) => f.path === WORKFLOW_PATH);
}

/** True when the user changed the workflow text away from the generated one. */
export function isEdited(state: Pick<WizardState, "generatedWorkflow" | "workflowDraft">): boolean {
  return state.workflowDraft !== null && state.workflowDraft !== state.generatedWorkflow;
}

/** Request body for preview / export / zip. */
export function toInput(
  state: Pick<WizardState, "repo" | "triggers" | "postAs" | "generatedWorkflow" | "workflowDraft">,
  opts: { withEdits: boolean },
): CiExportInputBody {
  return {
    repo: state.repo.trim(),
    target: "gha",
    action: "open_pr",
    post_as: state.postAs,
    triggers: state.triggers,
    ...(opts.withEdits && isEdited(state) ? { workflow_yaml: state.workflowDraft } : {}),
  };
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
