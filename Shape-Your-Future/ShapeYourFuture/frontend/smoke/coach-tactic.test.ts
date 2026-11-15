// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Coach: ONE tactic for today's obstacle. The AI only proposes; nothing is saved until the user confirms.
 * Real stores, api client, journey and Coach view; only fetch is stubbed.
 */

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

const TACTIC = {
  id: 7,
  stage: "laser",
  title_en: "Phone in another room",
  title_fa: "گوشی در اتاق دیگر",
  description_en: "Put the phone out of reach while you work.",
  description_fa: "هنگام کار گوشی را دور از دسترس بگذار.",
};

const TODAY_ENTRY = {
  date: "2026-11-14",
  exists: true,
  highlight: "Write the report",
  highlight_done: false,
  scheduled_time: null,
  laser: { notifications_off: false, remove_apps: false, internet_distance: false },
  energize: { walk: false, real_food: false, caffeine: false, rest: false },
  energy: null,
  reflection_note: null,
  change_for_tomorrow: null,
  tactic: null,
  tactic_applied: null,
};

let calls: { method: string; path: string; body: unknown }[];
let suggestReply: () => Response;
let confirmReply: () => Response;
let todayReply: () => Response;

async function setup(lang: "en" | "fa" = "en") {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  Element.prototype.scrollTo = () => {};
  calls = [];
  suggestReply = () => json({ needs_clarification: false, blocker_type: "distracted", tactic: TACTIC });
  confirmReply = () => json({ tactic: TACTIC, blocker_type: "distracted" });
  todayReply = () => json({ tactic: null, blocker_type: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = new URL(url).pathname;
      const method = (init.method ?? "GET").toUpperCase();
      calls.push({ method, path, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined });
      if (path === "/coach/tactic/suggest") return suggestReply();
      if (path === "/coach/tactic/confirm") return confirmReply();
      if (path === "/coach/tactic/today") return todayReply();
      // The Coach screen's Highlight card reads today's entry.
      if (path === "/daily-entry/today") return json(TODAY_ENTRY);
      return json({}, 404);
    })
  );
  const { authStorage } = await import("../src/api/auth-storage");
  authStorage.setToken("tok");
  const i18n = await import("../src/lib/theme-i18n");
  i18n.initThemeI18n();
  i18n.setLang(lang);
  const { journey } = await import("../src/state/journey");
  const { coachTacticStore } = await import("../src/state/coach-tactic");
  const coach = await import("../src/views/coach");
  const root = document.getElementById("root")!;
  const render = () => root.replaceChildren(coach.renderCoach());
  const flush = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { journey, store: coachTacticStore, render, root, i18n, flush };
}

const q = <T extends Element>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const saves = () => calls.filter((c) => c.path === "/coach/tactic/confirm");

async function describeObstacle(root: HTMLElement, flush: () => Promise<void>, text = "my phone keeps pinging") {
  const input = q<HTMLTextAreaElement>(root, "#coach-obstacle");
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  q<HTMLFormElement>(root, ".coach-tactic__form").requestSubmit();
  await flush();
}

describe("coach tactic card", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("is in the Coach screen, asks for the obstacle and cannot be submitted empty", async () => {
    const { render, root, flush } = await setup();
    render();
    await flush();
    expect(q(root, ".coach-tactic__title").textContent).toBe("One tactic for today");
    expect(q<HTMLButtonElement>(root, "[data-coach-suggest]").disabled).toBe(true);
    expect(calls.map((c) => c.path)).toContain("/coach/tactic/today");
    expect(root.querySelector(".chat-view, .chat-feed, textarea[data-chat]")).toBeNull(); // no chat on this screen
  });

  it("shows ONE suggested tactic and saves NOTHING until the user confirms", async () => {
    const { render, root, flush } = await setup();
    render();
    await flush();
    await describeObstacle(root, flush);
    expect(calls.find((c) => c.path === "/coach/tactic/suggest")!.body).toEqual({ obstacle: "my phone keeps pinging", lang: "en" });
    expect(root.querySelectorAll("[data-coach-tactic]")).toHaveLength(1);
    expect(q(root, ".coach-tactic__name").textContent).toBe("Phone in another room");
    expect(saves()).toHaveLength(0);
    expect(q(root, "[data-coach-confirm]")).not.toBeNull();
  });

  it("'Not this one' drops the suggestion without saving", async () => {
    const { render, root, flush } = await setup();
    render();
    await flush();
    await describeObstacle(root, flush);
    q<HTMLButtonElement>(root, "[data-coach-dismiss]").click();
    await flush();
    expect(root.querySelector("[data-coach-tactic]")).toBeNull();
    expect(q(root, "#coach-obstacle")).not.toBeNull();
    expect(saves()).toHaveLength(0);
  });

  it("confirm sends the tactic id once and then shows it as saved", async () => {
    const { render, root, flush } = await setup();
    render();
    await flush();
    await describeObstacle(root, flush);
    q<HTMLButtonElement>(root, "[data-coach-confirm]").click();
    q<HTMLButtonElement>(root, "[data-coach-confirm]")?.click(); // a double tap must not save twice
    await flush();
    expect(saves()).toHaveLength(1);
    expect(saves()[0].body).toEqual({ tactic_id: 7, blocker_type: "distracted" });
    expect(root.querySelector(".coach-tactic__status")!.textContent).toBe("Saved as today's tactic.");
    expect(root.querySelector("[data-coach-confirm]")).toBeNull();
  });

  it("a failed confirm keeps the suggestion, says so and can be retried", async () => {
    const { render, root, flush } = await setup();
    render();
    await flush();
    await describeObstacle(root, flush);
    confirmReply = () => json({ detail: "boom" }, 500);
    q<HTMLButtonElement>(root, "[data-coach-confirm]").click();
    await flush();
    expect(root.querySelector(".error-banner")).not.toBeNull();
    expect(root.querySelector("[data-coach-tactic]")).not.toBeNull();
    confirmReply = () => json({ tactic: TACTIC, blocker_type: "distracted" });
    q<HTMLButtonElement>(root, "[data-coach-confirm]").click();
    await flush();
    expect(root.querySelector(".coach-tactic__status")!.textContent).toBe("Saved as today's tactic.");
  });

  it("a vague obstacle asks for more and shows no tactic", async () => {
    const { render, root, flush } = await setup();
    suggestReply = () => json({ needs_clarification: true, blocker_type: null, tactic: null });
    render();
    await flush();
    await describeObstacle(root, flush, "meh");
    expect(root.querySelector("[data-coach-tactic]")).toBeNull();
    expect(root.textContent).toContain("Say a bit more");
    expect(q<HTMLTextAreaElement>(root, "#coach-obstacle").value).toBe("meh"); // the text is kept
  });

  it("an LLM outage is a translated error and the text is kept", async () => {
    const { render, root, flush } = await setup();
    suggestReply = () => json({ code: "llm_not_configured" }, 503);
    render();
    await flush();
    await describeObstacle(root, flush);
    expect(root.querySelector(".error-banner")).not.toBeNull();
    expect(q<HTMLTextAreaElement>(root, "#coach-obstacle").value).toBe("my phone keeps pinging");
  });

  it("today's confirmed tactic is shown after a reload", async () => {
    const { render, root, flush } = await setup();
    todayReply = () => json({ tactic: TACTIC, blocker_type: "distracted" });
    render();
    await flush();
    expect(q(root, ".coach-tactic__name").textContent).toBe("Phone in another room");
    expect(root.querySelector("[data-coach-another]")).not.toBeNull();
  });

  it("switching language redraws the same tactic in Persian without a new request", async () => {
    const { render, root, flush, i18n } = await setup();
    render();
    await flush();
    await describeObstacle(root, flush);
    const before = calls.length;
    i18n.setLang("fa");
    render();
    await flush();
    expect(q(root, ".coach-tactic__name").textContent).toBe("گوشی در اتاق دیگر");
    expect(q(root, ".coach-tactic__title").textContent).toBe("یک تاکتیک برای امروز");
    expect(calls.slice(before).filter((c) => c.path.includes("suggest") || c.path.includes("confirm"))).toEqual([]);
    expect(saves()).toHaveLength(0);
  });

  it("logging out drops the suggestion and the saved tactic", async () => {
    const { render, root, flush, store, journey } = await setup();
    render();
    await flush();
    await describeObstacle(root, flush);
    expect(store.get().suggestion).not.toBeNull();
    journey.goTo("AUTH");
    expect(store.get().suggestion).toBeNull();
    expect(store.get().phase).toBe("idle");
  });
});
