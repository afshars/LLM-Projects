import { el } from "../dom";
import { getLocale, t } from "../theme-i18n";

/**
 * confidenceBadge: shows a 0..1 model confidence as "High · 82%".
 *
 *   confidenceBadge(item.confidence)
 *
 * The level is written out, so it is not colour-only. Screen readers hear
 * "Confidence: High · 82%" (the prefix is visually hidden). Thresholds are
 * exported so the rest of the UI can stay consistent with them.
 */

export const CONFIDENCE_THRESHOLDS = { medium: 0.4, high: 0.7 } as const;
export type ConfidenceLevel = "low" | "medium" | "high" | "unknown";

export function confidenceLevel(value: number): ConfidenceLevel {
  if (!Number.isFinite(value)) return "unknown";
  if (value >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (value >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "low";
}

export function confidenceBadge(value: number): HTMLElement {
  const c = t().ui.confidence;
  const level = confidenceLevel(value);
  const percent = new Intl.NumberFormat(getLocale(), { style: "percent", maximumFractionDigits: 0 });
  const shown = Number.isFinite(value) ? percent.format(Math.min(1, Math.max(0, value))) : "";

  return el("span", { class: `ui-badge ui-badge--${level}` }, [
    el("span", { class: "ui-badge__dot", "aria-hidden": "true" }),
    el("span", { class: "sr-only" }, [`${c.label}: `]),
    c[level],
    ...(shown ? [" · ", el("bdi", {}, [shown])] : []),
  ]);
}
