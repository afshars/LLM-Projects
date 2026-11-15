import { el } from "./dom";
import type { Step } from "../state/journey";
import { t } from "./theme-i18n";
import type { StepKey } from "./theme-i18n";

/**
 * Phase 3/3 - Glowing Step Indicator.
 *
 * The 5 user-facing stages of the journey, rendered as a pipeline of
 * circular neon "orbs" instead of plain text links:
 *   - neon cyan + pulsing glow  -> the current stage,
 *   - neon emerald (solid)     -> completed stages,
 *   - muted violet             -> upcoming stages.
 *
 * DECOMPOSITION and PLANNING_REQUIRED both map to the "DECOMPOSITION"
 * stage since they're really one stage from the user's point of view
 * (build the tree, fill in any gaps). AUTH has no stage - it's shown
 * with no indicator at all.
 *
 * Labels come from the Phase 2 i18n dictionary (`t().steps[key]`), so
 * they flip between fa/en (and re-render RTL/LTR) the moment the
 * language is toggled in the top bar - app.ts re-draws the current
 * view on every theme/lang change for exactly this reason.
 */

const STAGES: Array<{ key: StepKey; steps: Step[] }> = [
  { key: "CONTEXT", steps: ["CONTEXT_SETUP"] },
  { key: "GOAL", steps: ["GOAL_CREATION"] },
  { key: "DECOMPOSITION", steps: ["DECOMPOSITION", "PLANNING_REQUIRED"] },
  { key: "PLAN", steps: ["DAILY_PLAN"] },
];

function stageIndex(step: Step): number {
  return STAGES.findIndex((s) => s.steps.includes(step));
}


/** ✓ for completed stages, 1-based stage number otherwise. */
function orbContent(state: "done" | "current" | "upcoming", index: number): string {
  return state === "done" ? "✓" : String(index + 1);
}

/**
 * Renders nothing for AUTH (no stage yet). Otherwise a glowing
 * pipeline of orbs with the current stage pulsing, so the user always
 * has a sense of where they are in the flow and how much is left.
 */
export function stepIndicator(step: Step): HTMLElement | null {
  const current = stageIndex(step);
  if (current === -1) return null;

  const dict = t();

  return el(
    "ol",
    { class: "si-track", "aria-label": dict.header.progress },
    STAGES.map((stage, i) => {
      const state: "done" | "current" | "upcoming" = i < current ? "done" : i === current ? "current" : "upcoming";
      const traveled = i > 0 && i <= current;

      return el(
        "li",
        {
          class: `si-node si-node--${state}${traveled ? " si-node--traveled" : ""}`,
          ...(i === current ? { "aria-current": "step" } : {}),
        },
        [
          el("span", { class: "si-orb", "aria-hidden": "true" }, [orbContent(state, i)]),
          el("span", { class: "si-label" }, [dict.steps[stage.key]]),
        ]
      );
    })
  );
}
