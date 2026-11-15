// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DailyEntry } from "../src/api/types";

/**
 * Step 10: the Today screen (Highlight, Laser + optional timer, Energize) through the real startApp, so a language
 * change really rebuilds the view. Only fetch is stubbed.
 */

const tick = () => new Promise((r) => setTimeout(r, 0));
const blank = (extra: Partial<DailyEntry> = {}): DailyEntry => ({
  date: "2026-11-09",
  exists: false,
  highlight: null,
  highlight_done: false,
  scheduled_time: null,
  laser: { notifications_off: false, remove_apps: false, internet_distance: false },
  energize: { walk: false, real_food: false, caffeine: false, rest: false },
  energy: null,
  reflection_note: null,
  change_for_tomorrow: null,
  tactic: null,
  tactic_applied: null,
  ...extra,
});

let calls: Array<{ method: string; url: string; body: Record<string, any> | null }>;
let server: DailyEntry;
let getReply: (() => { status: number; body: unknown }) | null;
let putFail: Array<number>;
let getGate: Promise<void> | null;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = "";
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
  calls = [];
  server = blank();
  getReply = null;
  putFail = [];
  getGate = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = (init.method ?? "GET").toUpperCase();
      const body = init.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, url, body });
      if (/\/daily-entry\/today/.test(url)) {
        if (method === "GET") {
          if (getGate) await getGate;
          const r = getReply?.();
          if (r) return new Response(JSON.stringify(r.body), { status: r.status });
          return new Response(JSON.stringify(server), { status: 200 });
        }
        const failure = putFail.shift();
        if (failure) return new Response(JSON.stringify({ detail: "x" }), { status: failure });
        server = { ...server, exists: true, laser: { ...server.laser, ...(body?.laser ?? {}) }, energize: { ...server.energize, ...(body?.energize ?? {}) } };
        for (const k of ["highlight", "scheduled_time"] as const) if (k in (body ?? {})) (server as any)[k] = body![k];
        if (server.highlight === null) server = { ...server, scheduled_time: null, highlight_done: false }; // as the real backend does
        return new Response(JSON.stringify(server), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    })
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function boot(opts: { lang?: "en" | "fa" } = {}) {
  const { authStorage } = await import("../src/api/auth-storage");
  authStorage.setToken("tok");
  const { initThemeI18n, setLang } = await import("../src/lib/theme-i18n");
  initThemeI18n();
  setLang(opts.lang ?? "en");
  const { journey } = await import("../src/state/journey");
  const { startApp } = await import("../src/app");
  journey.goTo("DAILY_PLAN");
  const root = document.createElement("div");
  document.body.append(root);
  startApp(root);
  await tick();
  await tick();
  return { setLang, journey };
}
const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const all = <T extends HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)];
const puts = () => calls.filter((c) => c.method === "PUT");
const gets = () => calls.filter((c) => c.method === "GET");
const check = (name: string) => q<HTMLInputElement>(`[data-today-check='${name}']`);
async function toggle(name: string) {
  const box = check(name);
  box.checked = !box.checked;
  box.dispatchEvent(new Event("change", { bubbles: true }));
  await tick();
  await tick();
}
async function typeHighlight(text: string) {
  const input = q<HTMLInputElement>("[data-today-highlight]");
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await tick();
  await tick();
}

describe("layout", () => {
  it("Today shows the three blocks: one Highlight field, the read-only tactic, 3 Laser checks, 4 Energize checks, and nothing else to fill", async () => {
    await boot();
    expect(q("h1").textContent).toBe("Today");
    expect(all("section.today-section h2").map((h) => h.textContent)).toEqual(["Highlight", "Today's tactic", "Laser", "Energize"]);
    expect(all("[data-today-highlight]")).toHaveLength(1);
    expect(all("[data-today-check^='laser.']").map((b) => b.getAttribute("data-today-check"))).toEqual(["laser.notifications_off", "laser.remove_apps", "laser.internet_distance"]);
    expect(all("[data-today-check^='energize.']").map((b) => b.getAttribute("data-today-check"))).toEqual(["energize.walk", "energize.real_food", "energize.caffeine", "energize.rest"]);
    expect(all("input[type=checkbox]")).toHaveLength(7);
    expect(gets()).toHaveLength(1);
    expect(gets()[0]!.url).toMatch(/\/daily-entry\/today\?day=\d{4}-\d{2}-\d{2}$/);
  });

  it("has no setup-wizard step indicator (Context / Goal / Breakdown ...) above it", async () => {
    await boot();
    expect(document.querySelector("#view .si-track")).toBeNull();
    expect(q("#view").textContent).not.toMatch(/Breakdown|Context/);
  });

  it("has no Save button, no points, no streaks, no totals, and no plan list from the old screen", async () => {
    await boot();
    const text = q("#view").textContent!.toLowerCase();
    expect(text).not.toMatch(/streak|points|score|%/);
    expect(document.querySelector("#view button[type=submit]")).toBeNull();
    expect(document.querySelector("[data-plan-start-focus]")).toBeNull();
    expect(document.querySelector("[data-now-ask]")).toBeNull();
    expect(document.querySelector("[data-daily-plan-refresh]")).toBeNull();
  });

  it("controls have accessible names: labelled inputs, checkboxes inside their labels, sections named by their headings", async () => {
    await boot();
    expect(q("label[for='today-highlight']").textContent).toBe("Today's Highlight");
    expect(q("label[for='today-schedule']")).not.toBeNull();
    for (const box of all<HTMLInputElement>("input[type=checkbox]")) expect(box.closest("label")!.textContent!.trim().length).toBeGreaterThan(2);
    for (const s of all("section.today-section")) expect(document.getElementById(s.getAttribute("aria-labelledby")!)).not.toBeNull();
  });

  it("shows what is already saved for today", async () => {
    server = blank({
      exists: true,
      highlight: "Write the plan",
      scheduled_time: "09:30",
      laser: { notifications_off: true, remove_apps: false, internet_distance: true },
      energize: { walk: true, real_food: false, caffeine: false, rest: true },
    });
    await boot();
    expect(q<HTMLInputElement>("[data-today-highlight]").value).toBe("Write the plan");
    expect(q<HTMLInputElement>("[data-today-schedule]").value).toBe("09:30");
    expect(q<HTMLInputElement>("[data-today-schedule]").disabled).toBe(false);
    expect(all<HTMLInputElement>("input[type=checkbox]").map((b) => b.checked)).toEqual([true, false, true, true, false, false, true]);
  });
});

describe("Highlight", () => {
  it("is saved when the field changes (only that key), and the time becomes available", async () => {
    await boot();
    expect(q<HTMLInputElement>("[data-today-schedule]").disabled).toBe(true);
    expect(q("#today-schedule-hint").textContent).toBe("Write your Highlight first.");
    await typeHighlight("  Write the first page  ");
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.body).toEqual({ highlight: "Write the first page" });
    expect(q<HTMLInputElement>("[data-today-highlight]").value).toBe("Write the first page");
    expect(q<HTMLInputElement>("[data-today-schedule]").disabled).toBe(false);
    expect(q("[data-today-saved]").textContent).toBe("Saved");
  });

  it("an unchanged or blank field sends nothing; clearing an existing Highlight sends null", async () => {
    server = blank({ exists: true, highlight: "Write", scheduled_time: "09:00" });
    await boot();
    await typeHighlight("Write");
    await typeHighlight("  Write ");
    expect(puts()).toHaveLength(0);
    await typeHighlight("   ");
    expect(puts()[0]!.body).toEqual({ highlight: null });
    expect(q<HTMLInputElement>("[data-today-schedule]").disabled).toBe(true);
    expect(q<HTMLInputElement>("[data-today-schedule]").value).toBe("");
  });

  it("Enter (form submit) saves and leaves the field", async () => {
    await boot();
    const input = q<HTMLInputElement>("[data-today-highlight]");
    input.focus();
    input.value = "Call the bank";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    q("form.today-highlight").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();
    await tick();
    expect(puts()[0]!.body).toEqual({ highlight: "Call the bank" });
    expect(document.activeElement).not.toBe(input);
  });

  it("the optional time is sent as HH:MM and cleared with null", async () => {
    server = blank({ exists: true, highlight: "Write" });
    await boot();
    const time = q<HTMLInputElement>("[data-today-schedule]");
    time.value = "09:30";
    time.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    await tick();
    time.value = "";
    time.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    await tick();
    expect(puts().map((p) => p.body)).toEqual([{ scheduled_time: "09:30" }, { scheduled_time: null }]);
  });

  it("the field is limited to 200 characters, the same as the backend", async () => {
    await boot();
    expect(q("[data-today-highlight]").getAttribute("maxlength")).toBe("200");
  });
});

describe("Laser and Energize checks", () => {
  it("a tap sends ONLY that key and does not rebuild the page (same node, focus stays)", async () => {
    await boot();
    const box = check("laser.remove_apps");
    box.focus();
    await toggle("laser.remove_apps");
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.body).toEqual({ laser: { remove_apps: true } });
    expect(check("laser.remove_apps")).toBe(box);
    expect(document.activeElement).toBe(box);
    expect(box.checked).toBe(true);
    await toggle("energize.walk");
    expect(puts()[1]!.body).toEqual({ energize: { walk: true } });
  });

  it("unticking is saved too (a plain yes/no)", async () => {
    server = blank({ exists: true, energize: { walk: true, real_food: false, caffeine: false, rest: false } });
    await boot();
    await toggle("energize.walk");
    expect(puts()[0]!.body).toEqual({ energize: { walk: false } });
  });

  it("a failed save keeps the tick, says it is not saved, and Try again sends it", async () => {
    await boot();
    putFail = [500];
    await toggle("energize.rest");
    expect(check("energize.rest").checked).toBe(true);
    expect(q("[data-today-status] .error-banner").textContent).toContain("isn't saved");
    expect(q("[data-today-saved]")).toBeNull();
    q("[data-today-retry]").click();
    await tick();
    await tick();
    expect(puts().map((p) => p.body)).toEqual([{ energize: { rest: true } }, { energize: { rest: true } }]);
    expect(q("[data-today-status] .error-banner")).toBeNull();
    expect(q("[data-today-saved]")).not.toBeNull();
  });
});

describe("loading and errors", () => {
  it("shows a skeleton while loading, and a translated error with Try again when the load fails", async () => {
    let open!: () => void;
    getGate = new Promise<void>((r) => (open = r));
    getReply = () => ({ status: 500, body: {} });
    await boot();
    expect(q("#view [aria-busy='true'], #view .ui-skeleton")).not.toBeNull();
    expect(q("h1").textContent).toBe("Today"); // never a blank page
    open();
    await tick();
    await tick();
    expect(q("#view [role='alert']").textContent).toMatch(/server/i);
    getReply = null;
    getGate = null;
    const retry = [...document.querySelectorAll<HTMLButtonElement>("#view button")].find((b) => /try again/i.test(b.textContent ?? ""))!;
    retry.click();
    await tick();
    await tick();
    expect(all("[data-today-check]")).toHaveLength(7);
    expect(gets()).toHaveLength(2);
  });
});

describe("language, direction and theme", () => {
  it("a language change rebuilds in the new language without a new request and keeps an unsaved Highlight", async () => {
    server = blank({ exists: true, laser: { notifications_off: true, remove_apps: false, internet_distance: false } });
    const { setLang } = await boot();
    const input = q<HTMLInputElement>("[data-today-highlight]");
    input.value = "half typed";
    input.dispatchEvent(new Event("input", { bubbles: true })); // typed, not saved yet
    setLang("fa");
    await tick();
    expect(gets()).toHaveLength(1);
    expect(puts()).toHaveLength(0);
    expect(q("h1").textContent).toBe("امروز");
    expect(all("section.today-section h2").map((h) => h.textContent)).toEqual(["هایلایت", "تاکتیک امروز", "لیزر", "انرژی"]);
    expect(q<HTMLInputElement>("[data-today-highlight]").value).toBe("half typed");
    expect(check("laser.notifications_off").checked).toBe(true);
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    setLang("en");
    await tick();
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
    expect(q("h1").textContent).toBe("Today");
  });

  it("the time field stays left-to-right inside the Persian layout; the Highlight field follows its own text", async () => {
    await boot({ lang: "fa" });
    expect(q("[data-today-schedule]").getAttribute("dir")).toBe("ltr");
    expect(q("[data-today-highlight]").getAttribute("dir")).toBe("auto");
  });

  it("a theme change does not ask the server again", async () => {
    await boot();
    const { setTheme } = await import("../src/lib/theme-i18n");
    setTheme("light");
    await tick();
    setTheme("dark");
    await tick();
    expect(gets()).toHaveLength(1);
    expect(all("[data-today-check]")).toHaveLength(7);
  });
});

describe("focus timer (optional)", () => {
  it("is off until started; Start shows the countdown, it ticks, and Stop puts it back", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    await boot();
    expect(q("[data-today-timer-start]")).not.toBeNull();
    expect(q<HTMLSelectElement>("[data-today-timer-minutes]").value).toBe("25");
    expect(puts()).toHaveLength(0); // the timer never calls the server
    q("[data-today-timer-start]").click();
    expect(q("[data-today-timer-status]").getAttribute("data-today-timer-status")).toBe("running");
    expect(q("[data-today-timer-time]").textContent).toBe("25:00");
    vi.advanceTimersByTime(65_000);
    expect(q("[data-today-timer-time]").textContent).toBe("23:55");
    q("[data-today-timer-clear]").click();
    expect(q("[data-today-timer-start]")).not.toBeNull();
    expect(calls.filter((c) => !/daily-entry\/today\?/.test(c.url) || c.method !== "GET")).toHaveLength(0);
  });

  it("another length can be chosen; at zero it says time is up and Done dismisses it", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    await boot();
    const select = q<HTMLSelectElement>("[data-today-timer-minutes]");
    select.value = "15";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    q("[data-today-timer-start]").click();
    expect(q("[data-today-timer-time]").textContent).toBe("15:00");
    vi.advanceTimersByTime(15 * 60_000 + 1_000);
    expect(q("[data-today-timer-status]").getAttribute("data-today-timer-status")).toBe("finished");
    expect(q("[data-today-timer]").textContent).toContain("Time is up");
    q("[data-today-timer-clear]").click();
    expect(q("[data-today-timer-start]")).not.toBeNull();
  });

  it("a running timer survives a language change and shows translated text", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const { setLang } = await boot();
    q("[data-today-timer-start]").click();
    vi.advanceTimersByTime(30_000);
    setLang("fa");
    expect(q("[data-today-timer-status]").textContent).toContain("تایمر تمرکز");
    expect(q("[data-today-timer-time]").textContent).toBe("24:30");
    expect(q("[data-today-timer-time]").getAttribute("dir")).toBe("ltr");
  });

  it("the interval is cleared when the screen is left (no timer keeps running in the background)", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const { journey } = await boot();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    journey.goTo("COACH");
    await tick();
    vi.advanceTimersByTime(2_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("styles", () => {
  const css = readFileSync("src/styles/today.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("uses tokens only: no hex / rgb() / hsl() / named colours", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(?:rgb|hsl)a?\((?!var\()/);
    expect(css).not.toMatch(/:\s*(?:white|black|red|green|blue|gray|grey)\b/);
  });

  it("uses logical properties only (RTL / LTR safe)", () => {
    expect(css).not.toMatch(/\b(?:margin|padding|border)-(?:left|right|top|bottom)\b/);
    expect(css).not.toMatch(/(?:^|[;{\s])(?:left|right|top|bottom)\s*:/);
    expect(css).not.toMatch(/\b(?:width|height|min-width|max-width|min-height|max-height)\s*:/);
    expect(css).not.toMatch(/text-align\s*:\s*(?:left|right)/);
    expect(css).not.toMatch(/float\s*:/);
  });

  it("is loaded by the app entry", () => {
    expect(readFileSync("src/main.ts", "utf8")).toContain('import "./styles/today.css"');
  });
});
