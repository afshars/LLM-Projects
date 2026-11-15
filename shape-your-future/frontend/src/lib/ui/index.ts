/** Public entry point of the shared UI components. Views import from here:
 *   import { asyncPanel, confirmDialog, formField } from "../lib/ui";
 * (styles live in styles/components.css, copy in ./i18n as `dict.ui`). */
export { asyncPanel } from "./async-panel";
export type { AsyncPanelOptions, AsyncStatus, SkeletonVariant } from "./async-panel";
export { confidenceBadge, confidenceLevel, CONFIDENCE_THRESHOLDS } from "./confidence-badge";
export type { ConfidenceLevel } from "./confidence-badge";
export { confirmDialog } from "./confirm-dialog";
export type { ConfirmDialogOptions, DialogKind } from "./confirm-dialog";
export { emptyStateGuide } from "./empty-state-guide";
export type { EmptyStateAction, EmptyStateOptions } from "./empty-state-guide";
export { clearFieldDraft, clearFieldDraftsByPrefix, formField } from "./form-field";
export type { FormControl, FormFieldHandle, FormFieldOptions } from "./form-field";
export { reviewAndConfirm } from "./review-and-confirm";
export type { ReviewAndConfirmOptions, ReviewItemContext } from "./review-and-confirm";
export { RATE_LIMIT_COOLDOWN_MS, submitLock } from "./submit-lock";
export type { SubmitBinding, SubmitLock, SubmitResult } from "./submit-lock";
