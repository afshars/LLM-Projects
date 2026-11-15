import { describe, expect, it } from "vitest";
import { FALLBACK_STEP, NAV_SECTIONS, activeSection, findRoute, isNavigableRoute, isNavigableStep, routeIdFor } from "../src/growth-os";
import { growthEn } from "../src/growth-os/i18n/en";
import { growthFa } from "../src/growth-os/i18n/fa";
import type { Step } from "../src/state/journey";

const allRoutes = NAV_SECTIONS.flatMap((s) => s.routes ?? []);
const liveSteps: Step[] = ["COACH", "DAILY_PLAN"];
/** Route ids that were in the product before the simplification. None of them may be navigable again. */
const REMOVED_ROUTE_IDS = [
  "goals/list",
  "reflect/progress-check",
  "reflect/weekly-growth",
  "reflect/behavior",
  "profile/smart-profile",
  "profile/preferences",
  "profile/appearance",
  "profile/energy",
  "profile/habits",
];
const retiredSteps: Step[] = ["DASHBOARD", "CONTEXT_SETUP", "GOAL_CREATION", "DECOMPOSITION", "GOAL_WORKSPACE", "PLANNING_REQUIRED"];

describe("navigation registry", () => {
  it("lists exactly the four product sections, in order", () => {
    expect(NAV_SECTIONS.map((s) => s.id)).toEqual(["today", "reflect", "chat", "profile"]);
  });

  it("has unique section ids and route ids", () => {
    expect(new Set(NAV_SECTIONS.map((s) => s.id)).size).toBe(NAV_SECTIONS.length);
    expect(new Set(allRoutes.map((r) => r.id)).size).toBe(allRoutes.length);
  });

  it("every section entry resolves (a navigable step, or a route inside the same section)", () => {
    for (const s of NAV_SECTIONS) {
      if ("route" in s.entry) expect(findRoute(s.entry.route)?.section.id).toBe(s.id);
      else expect(isNavigableStep(s.entry.step), s.id).toBe(true);
    }
  });

  it("every live step belongs to exactly one section", () => {
    for (const step of liveSteps) {
      expect(NAV_SECTIONS.filter((s) => s.legacySteps.includes(step)).length, step).toBe(1);
      expect(activeSection(step, null)).not.toBeNull();
    }
    expect(activeSection("AUTH", null)).toBeNull();
  });

  it("has no hidden route, no disabled item, no placement field and no feature list", () => {
    for (const s of NAV_SECTIONS) {
      expect(s as unknown as Record<string, unknown>).not.toHaveProperty("disabledItems");
      expect(s as unknown as Record<string, unknown>).not.toHaveProperty("placement");
    }
    for (const r of allRoutes) expect(r as unknown as Record<string, unknown>).not.toHaveProperty("hidden");
  });

  it("has copy for every section and route in both languages", () => {
    for (const g of [growthEn, growthFa]) {
      for (const s of NAV_SECTIONS) expect(g.nav[s.id], s.id).toBeTruthy();
      for (const r of allRoutes) expect(g.routes[r.labelKey].label, r.labelKey).toBeTruthy();
      expect(g.routes).not.toHaveProperty("llmAssignment");
    }
  });
});

describe("retired screens are unreachable", () => {
  it("retired steps are not navigable; live steps, AUTH and SECTION_VIEW are", () => {
    for (const step of retiredSteps) expect(isNavigableStep(step), step).toBe(false);
    for (const step of [...liveSteps, "AUTH", "SECTION_VIEW"] as Step[]) expect(isNavigableStep(step), step).toBe(true);
    expect(isNavigableStep(FALLBACK_STEP)).toBe(true);
  });

  it("retired and unknown route ids are not navigable and findRoute does not know them", () => {
    for (const id of REMOVED_ROUTE_IDS) {
      expect(isNavigableRoute(id), id).toBe(false);
      expect(findRoute(id), id).toBeNull();
    }
    expect(isNavigableRoute("nope/nope")).toBe(false);
    expect(isNavigableRoute(null)).toBe(false);
    for (const r of allRoutes) expect(isNavigableRoute(r.id), r.id).toBe(true);
  });

  it("no retired route id is also a live one", () => {
    const live = new Set(allRoutes.map((r) => r.id));
    for (const id of REMOVED_ROUTE_IDS) expect(live.has(id), id).toBe(false);
  });

  it("routeIdFor answers for live keys and throws for any other key", () => {
    expect(routeIdFor("reflect")).toBe("reflect/evening");
    expect(routeIdFor("account")).toBe("profile/account");
    expect(() => routeIdFor("progressCheck" as never)).toThrow();
    expect(() => routeIdFor("goalsList" as never)).toThrow();
    expect(() => routeIdFor("behavior" as never)).toThrow();
    expect(() => routeIdFor("llmAssignment" as never)).toThrow();
  });
});
