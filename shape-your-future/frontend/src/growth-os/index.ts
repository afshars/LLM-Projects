/** Public entry point of the Growth OS feature. Everything outside
 * `growth-os/` imports from here only. */
export { NAV_SECTIONS } from "./registry";
export { FALLBACK_STEP, activeSection, findRoute, findSection, isNavigableRoute, isNavigableStep, routeIdFor } from "./nav";
export type {
  NavIcon,
  NavRoute,
  NavSection,
  RouteKey,
  SectionId,
} from "./types";
export { growthEn } from "./i18n/en";
export { growthFa } from "./i18n/fa";
