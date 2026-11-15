import type { Step } from "../state/journey";
import { NAV_SECTIONS } from "./registry";
import type { NavRoute, NavSection, RouteKey, SectionId } from "./types";

/** Pure lookups over NAV_SECTIONS (no DOM, no state), so they are easy to test. */

export function findSection(id: SectionId): NavSection | undefined {
  return NAV_SECTIONS.find((s) => s.id === id);
}

export function findRoute(routeId: string | null): { section: NavSection; route: NavRoute } | null {
  if (!routeId) return null;
  for (const section of NAV_SECTIONS) {
    const route = section.routes?.find((r) => r.id === routeId);
    if (route) return { section, route };
  }
  return null;
}

/** Which section owns the view that is showing now. Null on AUTH. */
export function activeSection(step: Step, routeId: string | null): NavSection | null {
  if (step === "SECTION_VIEW") return findRoute(routeId)?.section ?? null;
  return NAV_SECTIONS.find((s) => s.legacySteps.includes(step)) ?? null;
}

/** True when `step` has a screen in the product: AUTH, the section view host, or a step that a section in NAV_SECTIONS
 * lists in `legacySteps` (Today, Coach). A retired step (Dashboard, Goals, Feedback, ...) is not navigable. */
export function isNavigableStep(step: Step): boolean {
  if (step === "AUTH" || step === "SECTION_VIEW") return true;
  return NAV_SECTIONS.some((s) => s.legacySteps.includes(step));
}

/** True when `routeId` is a sub-route of a section in NAV_SECTIONS (a retired or unknown id is not). */
export function isNavigableRoute(routeId: string | null): boolean {
  return findRoute(routeId) !== null;
}

/** Where a user is sent when something asks for a screen that is no longer in the product: Today. */
export const FALLBACK_STEP: Step = "DAILY_PLAN";

/** Part 20e: the route id ("reflect/evening") of a registry sub-route, looked up by its RouteKey. This is how a
 * CTA names a route: views and state never write a route id as a string, so renaming one in registry.ts needs no other
 * edit. Throws for a key that no section lists: that is a programming
 * error, and the module that asks fails at load time. */
export function routeIdFor(key: RouteKey): string {
  for (const section of NAV_SECTIONS) {
    const route = section.routes?.find((r) => r.labelKey === key);
    if (route) return route.id;
  }
  throw new Error(`growth-os: no sub-route is registered for RouteKey "${key}"`);
}
