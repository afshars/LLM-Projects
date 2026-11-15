import type { NavSection } from "./types";

/** Main navigation, in display order (sidebar top to bottom; the same four items fill the mobile bottom bar).
 *
 * Product filter (Shape Your Future): only what serves the daily loop (Highlight, Laser, Energize, Reflect) is listed
 * here: Today, Reflect, Coach (the tactic card; its nav id stays "chat"), Profile. A screen that is not listed here is not reachable: there is no tab, no
 * "More" menu and no "coming soon" item for it.
 *
 * To add a screen: add a `NavRoute` under its section, add its copy under `growth.routes` in both i18n files, and
 * render it in views/section-view.ts. Sections without `routes` reuse an existing journey step (`legacySteps`). */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: "today",
    icon: "today",
    legacySteps: ["DAILY_PLAN"],
    entry: { step: "DAILY_PLAN" },
  },
  {
    id: "reflect",
    icon: "reflect",
    legacySteps: [],
    entry: { route: "reflect/evening" },
    routes: [{ id: "reflect/evening", labelKey: "reflect" }],
  },
  { id: "chat", icon: "chat", legacySteps: ["COACH"], entry: { step: "COACH" } },
  {
    id: "profile",
    icon: "profile",
    legacySteps: [],
    entry: { route: "profile/account" },
    routes: [{ id: "profile/account", labelKey: "account" }],
  },
];
