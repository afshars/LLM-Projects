// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("navigation shell", () => {
  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("maketime:token", "x");
    document.body.innerHTML = '<div id="app"></div>';
    window.scrollTo = () => {};
    // Reflect and the Coach ask the server when they open; the shell test only looks at the shell.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("navigates, marks current, moves focus to <main>, shows disabled item", async () => {
    const { authStorage } = await import("../src/api/auth-storage");
    authStorage.setToken?.("tok");
    const { initThemeI18n, setLang } = await import("../src/lib/theme-i18n");
    initThemeI18n();
    setLang("en");
    const { journey } = await import("../src/state/journey");
    journey.goTo("COACH");
    const { startApp } = await import("../src/app");
    startApp(document.getElementById("app")!);

    const nav = document.querySelector<HTMLElement>(".app-nav")!;
    expect(nav.hidden).toBe(false);
    // Four sections, no "More" menu: Today, Reflect, Coach, Profile.
    const links = [...nav.querySelectorAll<HTMLButtonElement>(".app-nav__link")];
    expect(links.map((b) => b.textContent)).toEqual(["Today", "Reflect", "Coach", "Profile & Settings"]);
    expect(nav.querySelector(".app-nav__more-list")).toBeNull();
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toContain("Coach");

    links.find((b) => b.textContent === "Reflect")!.click();
    expect(document.activeElement).toBe(document.getElementById("view"));
    expect(document.querySelector("h1")?.textContent).toBe("Reflect");
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toContain("Reflect");
    // no section has tabs any more, and nothing is "coming soon"
    expect(document.querySelector(".subnav")).toBeNull();
    expect(document.querySelector(".subnav__link--disabled")).toBeNull();

    // a retired route id (deep link, old CTA) opens Today, never a blank page
    (document.getElementById("view") as HTMLElement).blur();
    journey.goToRoute("reflect/progress-check"); // the old Reflect route id (before Step 11) is gone too
    expect(journey.get()).toMatchObject({ step: "DAILY_PLAN", sectionRoute: null });
    journey.goToRoute("goals/list");
    expect(journey.get()).toMatchObject({ step: "DAILY_PLAN", sectionRoute: null });
    expect(document.getElementById("view")!.childElementCount).toBeGreaterThan(0);
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toContain("Today");

    // a retired step does the same
    journey.goTo("DASHBOARD");
    expect(journey.get().step).toBe("DAILY_PLAN");

    journey.goToRoute("profile/account");
    expect(document.querySelector(".subnav")).toBeNull();
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toContain("Profile");

    setLang("fa");
    expect(document.querySelector("h1")?.textContent).toBe("حساب کاربری");
    journey.reset();
    expect(nav.hidden).toBe(true);
  });

  it("the menu has its own fold button at the top of the sidebar; folded it keeps the four links and the choice is remembered", async () => {
    const { authStorage } = await import("../src/api/auth-storage");
    authStorage.setToken?.("tok");
    const { initThemeI18n, setLang } = await import("../src/lib/theme-i18n");
    initThemeI18n();
    setLang("en");
    const { journey } = await import("../src/state/journey");
    journey.goTo("COACH");
    const { startApp } = await import("../src/app");
    startApp(document.getElementById("app")!);

    const nav = document.querySelector<HTMLElement>(".app-nav")!;
    const fold = nav.querySelector<HTMLButtonElement>('[data-nav-fold="menu"]')!;
    expect(nav.firstElementChild).toBe(fold); // above the menu, not in the chat toolbar
    expect(nav.hasAttribute("data-collapsed")).toBe(false);
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    expect(fold.getAttribute("aria-label")).toBe("Hide menu");

    fold.click();
    expect(nav.hasAttribute("data-collapsed")).toBe(true);
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    expect(fold.getAttribute("aria-label")).toBe("Show menu");
    expect(localStorage.getItem("maketime:coach-menu-hidden")).toBe("1");
    // the menu is still all there (icon-only rail), each link named by a tooltip
    expect([...nav.querySelectorAll<HTMLButtonElement>(".app-nav__link")].map((b) => b.title)).toEqual(["Today", "Reflect", "Coach", "Profile & Settings"]);

    fold.click();
    expect(nav.hasAttribute("data-collapsed")).toBe(false);
    expect(localStorage.getItem("maketime:coach-menu-hidden")).toBeNull();
  });
});
