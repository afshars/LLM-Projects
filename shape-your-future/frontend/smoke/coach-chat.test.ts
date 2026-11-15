// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Coach screen in two parts: Highlight + tactic on the left, the AI chat on the right (views/coach.ts).
 * The chat is a plain conversation (/conversation/*): it stores its own messages and never changes today's entry.
 * Real stores, journey, api client and views; only fetch is stubbed, by a tiny in-memory copy of the backend.
 */

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const ENTRY = {
  date: "2026-11-14",
  exists: true,
  highlight: "Write the report",
  highlight_done: false,
  scheduled_time: "09:30",
  laser: { notifications_off: false, remove_apps: false, internet_distance: false },
  energize: { walk: false, real_food: false, caffeine: false, rest: false },
  energy: null,
  reflection_note: null,
  change_for_tomorrow: null,
  tactic: null,
  tactic_applied: null,
};

type Call = { method: string; path: string; search: string; body: any };
let calls: Call[];
let threads: Map<string, Array<[string, string]>>;
let failNextTurn: boolean;

const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const q = <T extends Element>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

async function setup(lang: "en" | "fa" = "en", storedId?: string) {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '<main id="main"></main>';
  Element.prototype.scrollTo = () => {};
  calls = [];
  threads = new Map();
  failNextTurn = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = new URL(url);
      const method = (init.method ?? "GET").toUpperCase();
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: u.pathname, search: u.search, body });
      if (u.pathname === "/daily-entry/today") return json(ENTRY);
      if (u.pathname === "/coach/tactic/today") return json({ tactic: null, blocker_type: null });
      if (u.pathname === "/conversation/start") {
        threads.set("c1", []);
        return json({ conversation_id: "c1", question_fa: null, done: false, current_topic: null, detected_intent: null, conversation_stage: "discovery", known_information: {}, missing_information: [] });
      }
      if (u.pathname === "/conversation/continue") {
        if (failNextTurn) {
          failNextTurn = false;
          return json({ detail: "boom" }, 502);
        }
        const reply = `Reply to: ${body.message}`;
        threads.get(body.conversation_id)!.push(["user", body.message], ["assistant", reply]);
        return json({ conversation_id: body.conversation_id, question_fa: reply, done: false, current_topic: null, detected_intent: null, conversation_stage: "discovery", known_information: {}, missing_information: [] });
      }
      if (u.pathname === "/conversation" && method === "GET") {
        const items = [...threads].filter(([, rows]) => rows.length > 0).map(([id, rows]) => ({
          conversation_id: id, title: rows[0][1], updated_at: "2026-11-14T10:00:00+00:00", message_count: rows.length,
        }));
        return json({ items });
      }
      if (u.pathname.startsWith("/conversation/") && method === "GET") {
        const id = u.pathname.split("/").pop()!;
        const rows = threads.get(id);
        if (!rows) return json({ detail: "conversation not found" }, 404);
        return json({
          conversation_id: id, question_fa: null, done: false, current_topic: null, detected_intent: null, conversation_stage: "discovery",
          known_information: {}, missing_information: [],
          messages: rows.map(([role, content]) => ({ role, content, at: "2026-11-14T10:00:00+00:00" })),
        });
      }
      return json({}, 404);
    })
  );
  const { authStorage } = await import("../src/api/auth-storage");
  authStorage.setToken("tok");
  if (storedId) localStorage.setItem("maketime_conversation_id", storedId);
  const i18n = await import("../src/lib/theme-i18n");
  i18n.initThemeI18n();
  i18n.setLang(lang);
  const { journey } = await import("../src/state/journey");
  const coach = await import("../src/views/coach");
  const chat = await import("../src/views/coach-chat");
  const { currentViewContext } = await import("../src/views/view-context");
  const main = document.getElementById("main")!;
  const render = () => {
    main.replaceChildren(coach.renderCoach());
    coach.mountCoachChat(main, currentViewContext());
  };
  return { journey, main, render, chat };
}

async function say(main: HTMLElement, text: string) {
  const input = q<HTMLTextAreaElement>(main, ".chat-composer__input");
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  q<HTMLButtonElement>(main, ".chat-composer__send").click();
  await settle();
}

describe("coach screen: Highlight + tactic | chat", () => {
  beforeEach(() => vi.useRealTimers());

  it("has the Highlight and tactic part first and the chat part second, each with its content", async () => {
    const { main, render } = await setup();
    render();
    await settle();
    const [side, chat] = [...q(main, ".coach-split").children].filter((n) => n.matches("section")) as HTMLElement[];
    expect(side.className).toContain("coach-split__side");
    expect(chat.className).toContain("coach-split__chat");
    expect(side.querySelector("[data-coach-highlight]")?.textContent).toBe("Write the report");
    expect(side.querySelector(".coach-tactic")).not.toBeNull();
    expect(chat.querySelector(".chat-composer")).not.toBeNull();
    expect(chat.querySelector(".coach-tactic")).toBeNull(); // the tactic card is not in the chat part
  });

  it("sends a message, shows the reply, and asks for the user's calendar day", async () => {
    const { main, render } = await setup();
    render();
    await say(main, "I cannot start");
    const feed = q<HTMLElement>(main, ".chat-feed").textContent ?? "";
    expect(feed).toContain("I cannot start");
    expect(feed).toContain("Reply to: I cannot start");
    const turn = calls.find((c) => c.path === "/conversation/continue")!;
    expect(turn.body).toMatchObject({ conversation_id: "c1", message: "I cannot start", lang: "en" });
    expect(turn.search).toMatch(/day=\d{4}-\d{2}-\d{2}/);
    expect(localStorage.getItem("maketime_conversation_id")).toBe("c1");
    expect(q<HTMLElement>(main, ".chat-suggestions").hidden).toBe(true);
  });

  it("a failed turn drops the bubble, hands the text back and shows a notice; resend works", async () => {
    const { main, render } = await setup();
    render();
    failNextTurn = true;
    await say(main, "first try");
    expect(q<HTMLTextAreaElement>(main, ".chat-composer__input").value).toBe("first try");
    expect(main.querySelectorAll(".chat-message--user")).toHaveLength(0);
    expect(main.querySelector(".chat-message--system")).not.toBeNull();
    q<HTMLButtonElement>(main, ".chat-composer__send").click();
    await settle();
    expect(main.querySelectorAll(".chat-message--user")).toHaveLength(1);
  });

  it("never writes the daily entry: the chat only touches /conversation", async () => {
    const { main, render } = await setup();
    render();
    await say(main, "hello");
    const writes = calls.filter((c) => c.method !== "GET").map((c) => c.path);
    expect(writes.every((p) => p.startsWith("/conversation/"))).toBe(true);
  });

  it("redraws the stored transcript after a reload, and a language switch does not fetch it again", async () => {
    const { main, render } = await setup("en", "c9");
    threads.set("c9", [["user", "earlier question"], ["assistant", "earlier answer"]]);
    render();
    await settle();
    expect(q<HTMLElement>(main, ".chat-feed").textContent).toContain("earlier answer");
    const fetches = () => calls.filter((c) => c.path === "/conversation/c9").length;
    expect(fetches()).toBe(1);
    render(); // what app.ts does on a language/theme change
    await settle();
    expect(fetches()).toBe(1);
    expect(q<HTMLElement>(main, ".chat-feed").textContent).toContain("earlier answer");
  });

  it("an unknown stored conversation says so and offers a fresh start", async () => {
    const { main, render } = await setup("en", "gone");
    render();
    await settle();
    expect(main.querySelector(".chat-restore--error")).not.toBeNull();
    q<HTMLButtonElement>(main, ".chat-restore--error .btn-primary").click();
    await settle();
    expect(main.querySelector(".chat-restore--error")).toBeNull();
    expect(localStorage.getItem("maketime_conversation_id")).toBeNull();
  });

  it("history lists earlier conversations and opens one", async () => {
    const { main, render } = await setup();
    render();
    await say(main, "plan my morning");
    const [history, newChat] = [...main.querySelectorAll<HTMLButtonElement>(".chat-toolbar__btn")];
    newChat.click();
    await settle();
    expect(main.querySelectorAll(".chat-message")).toHaveLength(1); // only the greeting
    history.click();
    await settle();
    const item = q<HTMLButtonElement>(main, ".chat-history__item");
    expect(item.textContent).toContain("plan my morning");
    item.click();
    await settle();
    expect(q<HTMLElement>(main, ".chat-feed").textContent).toContain("Reply to: plan my morning");
  });

  it("the side part can be folded away by its own button (first in that part), and the choice is remembered", async () => {
    const { main, render } = await setup();
    render();
    await settle();
    const split = q<HTMLElement>(main, ".coach-split");
    const side = q<HTMLElement>(main, ".coach-split__side");
    // the button is the very first thing in the left part, not in the chat toolbar
    expect(side.firstElementChild?.classList.contains("coach-side-bar")).toBe(true);
    expect(side.querySelector('[data-coach-fold="side"]')).not.toBeNull();
    expect(q<HTMLElement>(main, ".chat-toolbar").querySelector("[data-coach-fold]")).toBeNull();
    expect(split.dataset.side).toBe("open");
    q<HTMLButtonElement>(main, '[data-coach-fold="side"]').click();
    expect(split.dataset.side).toBe("collapsed");
    expect(q<HTMLButtonElement>(main, '[data-coach-fold="side"]').getAttribute("aria-expanded")).toBe("false");
    render(); // a redraw (language switch) or a reload keeps it
    expect(q<HTMLElement>(main, ".coach-split").dataset.side).toBe("collapsed");
    q<HTMLButtonElement>(main, '[data-coach-fold="side"]').click();
    expect(q<HTMLElement>(main, ".coach-split").dataset.side).toBe("open");
  });
});
