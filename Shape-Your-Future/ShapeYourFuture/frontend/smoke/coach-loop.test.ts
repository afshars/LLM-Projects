// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Step 2 (core rule): no AI output is saved without the user's explicit approval, and an approved tactic is part of
 * the daily loop: Coach -> Today (the day's tactic) -> Reflect ("did you apply it?").
 *
 * Real app shell, stores, views and api client. Only fetch is stubbed, by a tiny in-memory server that behaves like
 * the backend: /coach/tactic/suggest stores nothing, /coach/tactic/confirm writes today's entry, and
 * /daily-entry/today returns that entry with `tactic` / `tactic_applied`.
 */

const TACTIC = {
  id: 7,
  stage: "laser",
  title_en: "Phone in another room",
  title_fa: "گوشی در اتاق دیگر",
  description_en: "Put the phone out of reach while you work.",
  description_fa: "هنگام کار گوشی را دور از دسترس بگذار.",
};
const DAY = "2026-11-09";

type Server = { tactic: typeof TACTIC | null; blocker: string | null; applied: boolean | null; writes: string[] };
let db: Server;
let calls: Array<{ method: string; path: string; body: any }>;

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 4; i++) await tick();
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

function entry() {
  return {
    date: DAY,
    exists: db.tactic !== null,
    highlight: "Write the report",
    highlight_done: false,
    scheduled_time: null,
    laser: { notifications_off: false, remove_apps: false, internet_distance: false },
    energize: { walk: false, real_food: false, caffeine: false, rest: false },
    energy: null,
    reflection_note: null,
    change_for_tomorrow: null,
    tactic: db.tactic,
    tactic_applied: db.tactic ? db.applied : null,
  };
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = "";
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
  db = { tactic: null, blocker: null, applied: null, writes: [] };
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = new URL(url).pathname;
      const method = (init.method ?? "GET").toUpperCase();
      const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
      calls.push({ method, path, body });
      if (path === "/coach/tactic/suggest") return json({ needs_clarification: false, blocker_type: "distracted", tactic: TACTIC }); // saves nothing
      if (path === "/coach/tactic/confirm") {
        db.writes.push("confirm");
        db.tactic = TACTIC;
        db.blocker = body.blocker_type;
        db.applied = null;
        return json({ tactic: TACTIC, blocker_type: db.blocker });
      }
      if (path === "/coach/tactic/today") return json({ tactic: db.tactic, blocker_type: db.blocker });
      if (path === "/daily-entry/today" && method === "GET") return json(entry());
      if (path === "/daily-entry/today" && method === "PUT") {
        db.writes.push("daily-entry");
        if ("tactic_applied" in body) db.applied = body.tactic_applied;
        return json(entry());
      }
      if (path === "/daily-entry/recent") return json({ days: [] });
      return json({}, 404);
    })
  );
});

async function boot(lang: "en" | "fa" = "en") {
  const { authStorage } = await import("../src/api/auth-storage");
  authStorage.setToken("tok");
  const i18n = await import("../src/lib/theme-i18n");
  i18n.initThemeI18n();
  i18n.setLang(lang);
  const { journey } = await import("../src/state/journey");
  const { startApp } = await import("../src/app");
  journey.goTo("COACH");
  const root = document.createElement("div");
  document.body.append(root);
  startApp(root);
  await settle();
  return { journey, i18n };
}
const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const maybe = (sel: string) => document.querySelector(sel);

async function askCoach() {
  const input = q<HTMLTextAreaElement>("#coach-obstacle");
  input.value = "my phone keeps pinging";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  q<HTMLFormElement>(".coach-tactic__form").requestSubmit();
  await settle();
}
const writes = () => calls.filter((c) => c.method !== "GET" && c.path !== "/coach/tactic/suggest");

describe("(a) nothing is saved when the user has not approved", () => {
  it("a suggestion alone writes nothing, and Today / Reflect do not show it", async () => {
    const { journey } = await boot();
    await askCoach();
    expect(maybe("[data-coach-tactic]")).not.toBeNull(); // the proposal is on screen ...
    expect(writes()).toEqual([]); // ... but no request that could store it was sent
    expect(db.writes).toEqual([]);
    expect(db.tactic).toBeNull();

    journey.goTo("DAILY_PLAN");
    await settle();
    expect(maybe("[data-today-tactic]")).toBeNull();
    expect(maybe("[data-today-tactic-none]")).not.toBeNull();
    journey.goToRoute("reflect/evening");
    await settle();
    expect(maybe("[data-reflect-applied]")).toBeNull();
    expect(db.writes).toEqual([]);
  });

  it("'Not this one' (reject) writes nothing either", async () => {
    await boot();
    await askCoach();
    q<HTMLButtonElement>("[data-coach-dismiss]").click();
    await settle();
    expect(maybe("[data-coach-tactic]")).toBeNull();
    expect(writes()).toEqual([]);
    expect(db.tactic).toBeNull();
  });

  it("leaving Coach with an unanswered suggestion, then coming back to Today, still saves nothing", async () => {
    const { journey } = await boot();
    await askCoach();
    journey.goTo("DAILY_PLAN");
    await settle();
    journey.goTo("COACH");
    await settle();
    expect(writes()).toEqual([]);
    expect(db.writes).toEqual([]);
  });
});

describe("(b) an approved tactic is part of the daily loop", () => {
  it("shows on Today as the day's tactic right after the user approves it", async () => {
    const { journey } = await boot();
    await askCoach();
    q<HTMLButtonElement>("[data-coach-confirm]").click();
    await settle();
    expect(db.writes).toEqual(["confirm"]); // exactly one write, after the click
    expect(calls.find((c) => c.path === "/coach/tactic/confirm")!.body).toEqual({ tactic_id: 7, blocker_type: "distracted" });

    journey.goTo("DAILY_PLAN");
    await settle();
    expect(q("[data-today-tactic]").getAttribute("data-today-tactic")).toBe("7");
    expect(q("[data-today-tactic] .today-tactic__name").textContent).toBe("Phone in another room");
    expect(maybe("[data-today-tactic-none]")).toBeNull();
  });

  it("shows on Reflect and the user can say whether they applied it (saved by itself, kept after a reload)", async () => {
    const { journey } = await boot();
    await askCoach();
    q<HTMLButtonElement>("[data-coach-confirm]").click();
    await settle();

    journey.goToRoute("reflect/evening");
    await settle();
    expect(q("[data-reflect-tactic]").textContent).toBe("Phone in another room");
    expect(q<HTMLInputElement>("[data-reflect-applied='yes']").checked).toBe(false);
    expect(q<HTMLInputElement>("[data-reflect-applied='no']").checked).toBe(false); // unanswered stays unanswered

    const yes = q<HTMLInputElement>("[data-reflect-applied='yes']");
    yes.checked = true;
    yes.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    expect(calls.filter((c) => c.method === "PUT").map((c) => c.body)).toEqual([{ tactic_applied: true }]);
    expect(db.applied).toBe(true);

    // a fresh load of the page (new module graph, same server) still has the answer
    vi.resetModules();
    const again = await boot();
    again.journey.goToRoute("reflect/evening");
    await settle();
    expect(q<HTMLInputElement>("[data-reflect-applied='yes']").checked).toBe(true);
  });

  it("Reflect has no tactic question when no tactic was approved that day", async () => {
    const { journey } = await boot();
    journey.goToRoute("reflect/evening");
    await settle();
    expect(maybe("[data-reflect-applied]")).toBeNull();
    expect(maybe("[data-reflect-done]")).not.toBeNull(); // the other questions are still there
  });

  it("is shown in Persian when the language is Persian", async () => {
    db.tactic = TACTIC;
    db.blocker = "distracted";
    const { journey } = await boot("fa");
    journey.goTo("DAILY_PLAN");
    await settle();
    expect(q("[data-today-tactic] .today-tactic__name").textContent).toBe("گوشی در اتاق دیگر");
    journey.goToRoute("reflect/evening");
    await settle();
    expect(q("[data-reflect-tactic]").textContent).toBe("گوشی در اتاق دیگر");
    expect(q("#reflect-q-tactic").textContent).toContain("تاکتیک امروزت");
  });
});
