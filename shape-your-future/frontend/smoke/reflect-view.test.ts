// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DailyEntry, RecentDay } from "../src/api/types";
import { DICTIONARIES } from "../src/lib/dictionary";

/**
 * Step 11: the Reflect screen (3 evening questions + last 7 days). The view is mounted directly (it is the body of
 * the route reflect/evening); only fetch is stubbed. A "language change" is what app.ts does: build the view again.
 */

const tick = () => new Promise((r) => setTimeout(r, 0));

let calls: Array<{ method: string; url: string; body: Record<string, any> | null }>;
let server: DailyEntry;
let recentDays: (today: string) => RecentDay[];
let getReply: (() => { status: number; body: unknown }) | null;
let recentReply: (() => { status: number; body: unknown }) | null;
let putFail: number[];
let iso: (offset: number) => string;

const blank = (date: string, extra: Partial<DailyEntry> = {}): DailyEntry => ({
  date,
  exists: false,
  highlight: null,
  highlight_done: false,
  scheduled_time: null,
  laser: { notifications_off: false, remove_apps: false, internet_distance: false },
  energize: { walk: false, real_food: false, caffeine: false, rest: false },
  energy: null,
  reflection_note: null,
  change_for_tomorrow: null,
  ...extra,
});

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = "";
  calls = [];
  getReply = null;
  recentReply = null;
  putFail = [];
  const { localDay } = await import("../src/state/today");
  iso = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return localDay(d);
  };
  server = blank(iso(0), { highlight: "Write the report", exists: true });
  recentDays = (today) =>
    [-6, -5, -4, -3, -2, -1, 0].map((o, i) => {
      const date = iso(o);
      if (o === 0) return { date, highlight: server.highlight, highlight_done: server.highlight === null ? null : server.highlight_done };
      return i % 3 === 0 ? { date, highlight: null, highlight_done: null } : { date, highlight: `H${i}`, highlight_done: i % 2 === 0 };
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = (init.method ?? "GET").toUpperCase();
      const body = init.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, url, body });
      if (/\/daily-entry\/recent/.test(url)) {
        const r = recentReply?.();
        if (r) return new Response(JSON.stringify(r.body), { status: r.status });
        return new Response(JSON.stringify({ days: recentDays(server.date) }), { status: 200 });
      }
      if (/\/daily-entry\/today/.test(url)) {
        if (method === "GET") {
          const r = getReply?.();
          if (r) return new Response(JSON.stringify(r.body), { status: r.status });
          return new Response(JSON.stringify(server), { status: 200 });
        }
        const failure = putFail.shift();
        if (failure) return new Response(JSON.stringify({ detail: "x" }), { status: failure });
        server = { ...server, exists: true };
        for (const k of ["highlight_done", "energy", "change_for_tomorrow"] as const) if (body && k in body) (server as any)[k] = body[k];
        return new Response(JSON.stringify(server), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

async function mount(lang: "en" | "fa" = "en") {
  const { authStorage } = await import("../src/api/auth-storage");
  authStorage.setToken("tok");
  const { initThemeI18n, setLang } = await import("../src/lib/theme-i18n");
  initThemeI18n();
  setLang(lang);
  const { renderReflect } = await import("../src/views/reflect");
  let node = renderReflect();
  document.body.append(node);
  await tick();
  await tick();
  return {
    // what app.ts does on a language change
    async switchTo(next: "en" | "fa") {
      setLang(next);
      const fresh = renderReflect();
      node.replaceWith(fresh);
      node = fresh;
      await tick();
      await tick();
    },
  };
}
const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const all = <T extends HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)];
const puts = () => calls.filter((c) => c.method === "PUT");
const rows = () => all("[data-reflect-day]");

async function answerEnergy(n: number) {
  const radio = q<HTMLInputElement>(`[data-reflect-energy='${n}']`);
  radio.checked = true;
  radio.dispatchEvent(new Event("change", { bubbles: true }));
  await tick();
  await tick();
}
async function typeChange(text: string) {
  const input = q<HTMLTextAreaElement>("[data-reflect-change]");
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await tick();
  await tick();
}
async function tickDone(value: boolean) {
  const box = q<HTMLInputElement>("[data-reflect-done]");
  box.checked = value;
  box.dispatchEvent(new Event("change", { bubbles: true }));
  await tick();
  await tick();
}

describe("the three questions", () => {
  it("shows today's Highlight with one yes box, ten energy numbers and one text field", async () => {
    await mount();
    const en = DICTIONARIES.en.reflect;
    const text = document.body.textContent!;
    expect(text).toContain(en.highlight.title);
    expect(text).toContain(en.energy.title);
    expect(text).toContain(en.change.title);
    expect(q("[data-reflect-highlight]").textContent).toBe("Write the report");
    expect(all("[data-reflect-done]")).toHaveLength(1);
    expect(all("[data-reflect-energy]")).toHaveLength(10);
    expect(all("[data-reflect-change]")).toHaveLength(1);
    expect(all("button")).toHaveLength(0); // no Save button: answers save by themselves
  });

  it("question 1 saves highlight_done as a boolean, and can be undone", async () => {
    await mount();
    await tickDone(true);
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.body).toEqual({ highlight_done: true });
    await tickDone(false);
    expect(puts()[1]!.body).toEqual({ highlight_done: false });
  });

  it("question 2 saves the chosen number (1 to 10) and shows exactly one selected", async () => {
    await mount();
    await answerEnergy(7);
    expect(puts()[0]!.body).toEqual({ energy: 7 });
    expect(all<HTMLInputElement>("[data-reflect-energy]").filter((r) => r.checked).map((r) => r.value)).toEqual(["7"]);
    await answerEnergy(1);
    expect(puts()[1]!.body).toEqual({ energy: 1 });
    await answerEnergy(10);
    expect(puts()[2]!.body).toEqual({ energy: 10 });
  });

  it("question 3 saves the trimmed sentence when the field is left, and clears it when emptied", async () => {
    await mount();
    await typeChange("  Phone out of the room  ");
    expect(puts()[0]!.body).toEqual({ change_for_tomorrow: "Phone out of the room" });
    expect(q<HTMLTextAreaElement>("[data-reflect-change]").value).toBe("Phone out of the room");
    await typeChange("   ");
    expect(puts()[1]!.body).toEqual({ change_for_tomorrow: null });
  });

  it("question 3 does not save when nothing changed", async () => {
    server = { ...server, change_for_tomorrow: "Same" };
    await mount();
    await typeChange("Same");
    expect(puts()).toHaveLength(0);
  });

  it("shows what is already saved for today (answers given earlier, or on another device)", async () => {
    server = { ...server, highlight_done: true, energy: 4, change_for_tomorrow: "Walk first" };
    await mount();
    expect(q<HTMLInputElement>("[data-reflect-done]").checked).toBe(true);
    expect(all<HTMLInputElement>("[data-reflect-energy]").filter((r) => r.checked).map((r) => r.value)).toEqual(["4"]);
    expect(q<HTMLTextAreaElement>("[data-reflect-change]").value).toBe("Walk first");
  });

  it("without a Highlight today there is no yes box (the server would refuse it), only a way to Today", async () => {
    server = blank(iso(0));
    await mount();
    expect(all("[data-reflect-done]")).toHaveLength(0);
    expect(q("[data-reflect-no-highlight]").textContent).toBe(DICTIONARIES.en.reflect.highlight.none);
    expect(all("[data-reflect-energy]")).toHaveLength(10); // energy and tomorrow's change still work
    await answerEnergy(5);
    expect(puts()[0]!.body).toEqual({ energy: 5 });
  });

  it("the text typed survives a language change (the view is rebuilt)", async () => {
    const { switchTo } = await mount();
    const input = q<HTMLTextAreaElement>("[data-reflect-change]");
    input.value = "Half written";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await switchTo("fa");
    expect(q<HTMLTextAreaElement>("[data-reflect-change]").value).toBe("Half written");
    expect(document.body.textContent).toContain(DICTIONARIES.fa.reflect.change.title);
    expect(puts()).toHaveLength(0); // typing alone saves nothing
  });

  it("is fully translated: Persian titles, no English left over", async () => {
    await mount("fa");
    const fa = DICTIONARIES.fa.reflect;
    const text = document.body.textContent!;
    for (const s of [fa.highlight.title, fa.energy.title, fa.energy.hint, fa.change.title, fa.recent.title]) expect(text).toContain(s);
    expect(text).not.toContain(DICTIONARIES.en.reflect.energy.title);
  });
});

describe("saving status", () => {
  it("a failed save keeps the answer on screen, says it is not saved, and Try again sends it", async () => {
    await mount();
    putFail = [500];
    await answerEnergy(3);
    expect(q("[data-reflect-status]").textContent).toContain(DICTIONARIES.en.reflect.status.notSaved);
    expect(all<HTMLInputElement>("[data-reflect-energy]").filter((r) => r.checked).map((r) => r.value)).toEqual(["3"]);
    q("[data-reflect-retry]").click();
    await tick();
    await tick();
    expect(puts()).toHaveLength(2);
    expect(puts()[1]!.body).toEqual({ energy: 3 });
    expect(all("[data-reflect-retry]")).toHaveLength(0);
    expect(q("[data-reflect-status]").textContent).toContain(DICTIONARIES.en.reflect.status.saved);
  });
});

describe("last 7 days", () => {
  it("lists seven days, today on top, each with only yes / no / no Highlight", async () => {
    await mount();
    const rr = DICTIONARIES.en.reflect.recent;
    expect(rows()).toHaveLength(7);
    expect(rows()[0]!.getAttribute("data-reflect-day")).toBe(iso(0));
    expect(rows()[0]!.textContent).toContain(rr.today);
    expect(rows()[6]!.getAttribute("data-reflect-day")).toBe(iso(-6));
    const results = all("[data-result]").map((r) => r.getAttribute("data-result"));
    expect(results.every((r) => r === "yes" || r === "no" || r === "none")).toBe(true);
    const words = all("[data-result]").map((r) => r.textContent);
    expect(words.every((w) => [rr.yes, rr.no, rr.noHighlight].includes(w!))).toBe(true);
  });

  it("shows no stats, no streaks and no numbers beyond the dates", async () => {
    await mount();
    const list = q(".reflect-recent").textContent!.toLowerCase();
    for (const banned of ["streak", "%", "average", "total", "score", "points", "of 7"]) expect(list).not.toContain(banned);
  });

  it("today's row follows the tick made a moment ago, without asking the server again", async () => {
    await mount();
    expect(q(`[data-reflect-day='${iso(0)}'] [data-result]`).getAttribute("data-result")).toBe("no");
    const recentCallsBefore = calls.filter((c) => /recent/.test(c.url)).length;
    await tickDone(true);
    expect(q(`[data-reflect-day='${iso(0)}'] [data-result]`).getAttribute("data-result")).toBe("yes");
    expect(calls.filter((c) => /recent/.test(c.url)).length).toBe(recentCallsBefore);
  });

  it("is translated in Persian", async () => {
    await mount("fa");
    const fa = DICTIONARIES.fa.reflect.recent;
    expect(rows()[0]!.textContent).toContain(fa.today);
    const words = all("[data-result]").map((r) => r.textContent);
    expect(words.every((w) => [fa.yes, fa.no, fa.noHighlight].includes(w!))).toBe(true);
  });

  it("if the list cannot be loaded the questions still work, and Try again loads it", async () => {
    recentReply = () => ({ status: 500, body: {} });
    await mount();
    expect(rows()).toHaveLength(0);
    expect(q(".reflect-recent").textContent).toContain(DICTIONARIES.en.ui.async.retry);
    await answerEnergy(6);
    expect(puts()[0]!.body).toEqual({ energy: 6 });
    recentReply = null;
    const retry = [...document.querySelectorAll<HTMLButtonElement>(".reflect-recent button")].find((b) => b.textContent === DICTIONARIES.en.ui.async.retry)!;
    retry.click();
    await tick();
    await tick();
    expect(rows()).toHaveLength(7);
  });
});

describe("when today cannot be loaded", () => {
  it("shows the translated error with Try again instead of a blank screen", async () => {
    getReply = () => ({ status: 500, body: {} });
    await mount();
    expect(all("[data-reflect-done]")).toHaveLength(0);
    expect(document.body.textContent).toContain(DICTIONARIES.en.ui.async.retry);
    getReply = null;
    const retry = [...document.querySelectorAll<HTMLButtonElement>(".reflect-page button")].find((b) => b.textContent === DICTIONARIES.en.ui.async.retry)!;
    retry.click();
    await tick();
    await tick();
    expect(all("[data-reflect-energy]")).toHaveLength(10);
  });
});
