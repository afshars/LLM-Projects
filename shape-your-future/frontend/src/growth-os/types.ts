/** Shared types for the Growth OS layer. */

import type { Step } from "../state/journey";

// ---------------- Navigation shell (Part 4) ----------------

/** Sections of the main navigation. Also the keys of `dict.growth.nav`. Exactly the four sections of NAV_SECTIONS. */
export type SectionId = "today" | "reflect" | "chat" | "profile";

/** Keys of `dict.growth.routes` (label per sub-route). Exactly the routes NAV_SECTIONS lists. */
export type RouteKey = "reflect" | "account";

export type NavIcon = SectionId;

/** A sub-route inside a section (rendered by views/section-view.ts). */
export interface NavRoute {
  /** Stable id passed to `journey.goToRoute`, e.g. "reflect/evening". */
  id: string;
  labelKey: RouteKey;
}

export interface NavSection {
  id: SectionId;
  icon: NavIcon;
  /** Existing journey steps that already render this section's main view
   * (used only to highlight the section while one of them is showing). */
  legacySteps: readonly Step[];
  /** Where clicking the section goes: an existing step or its first sub-route. */
  entry: { step: Step } | { route: string };
  /** Sub-navigation (tabs). Omit for sections that are a single view. */
  routes?: readonly NavRoute[];
}
