/* diff-viewer — unified-diff viewer with optional inline GitHub comments and
   optional Smart-Diff role grouping + inline findings.
   Public surface: the DiffViewer component + the DiffCommentApi/DiffFindingApi
   contracts. FileCard/FileGroup/styles/comments/findings/helpers stay private. */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export type { DiffFindingApi } from "./findings";
export type { RiskAnnotation, RiskAnnotationsByFile } from "./RiskAnnotationCard";
export { buildRiskAnnotations, parseFileRef } from "./RiskAnnotationCard";
