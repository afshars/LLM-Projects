// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initThemeI18n, setLang } from "../src/lib/theme-i18n";
import { asyncPanel, confidenceBadge, confirmDialog, emptyStateGuide, formField, reviewAndConfirm, submitLock } from "../src/lib/ui";
import { draftClear } from "../src/lib/ui/drafts";
import type { ApiError } from "../src/api/types";

const tick = () => new Promise((r) => setTimeout(r, 0));
const deferred = <T = void>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
const apiErr = (kind: ApiError["kind"], status: number | null = null): ApiError => ({ kind, status, message: "" });

beforeEach(() => {
  document.body.innerHTML = '<div id="app"><main id="view" tabindex="-1"><button id="opener" data-focus-key="opener">open</button></main></div>';
  localStorage.clear();
  initThemeI18n();
  setLang("en");
});
afterEach(() => vi.useRealTimers());

describe("submitLock", () => {
  it("blocks a double submit and disables buttons while busy", async () => {
    const btn = document.createElement("button");
    document.body.append(btn);
    const lock = submitLock("t1", { buttons: [btn], primary: btn, idleLabel: "Save", busyLabel: "Saving…" });
    const d = deferred<string>();
    const task = vi.fn(() => d.promise);
    const first = lock.run(task);
    const second = await lock.run(task); // same tick
    expect(second.status).toBe("busy");
    expect(task).toHaveBeenCalledTimes(1);
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe("Saving…");
    expect(btn.getAttribute("aria-busy")).toBe("true");
    d.resolve("x");
    expect(await first).toEqual({ status: "ok", value: "x" });
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe("Save");
  });

  it("on 429 shows the wait message, then re-enables after the cooldown", async () => {
    vi.useFakeTimers();
    const btn = document.createElement("button");
    const status = document.createElement("p");
    document.body.append(btn, status);
    const lock = submitLock("t2", { buttons: [btn], status, cooldownMs: 1000 });
    const res = await lock.run(async () => { throw apiErr("rate_limit", 429); });
    expect(res.status).toBe("rate_limited");
    expect(btn.disabled).toBe(true);
    expect(status.textContent).toMatch(/wait a moment/i);
    expect((await lock.run(async () => 1)).status).toBe("busy"); // still cooling
    vi.advanceTimersByTime(1001);
    expect(btn.disabled).toBe(false);
    expect(status.textContent).toBe("");
    expect((await lock.run(async () => 1)).status).toBe("ok");
  });

  it("re-binds new buttons to a request still running (language-switch rebuild)", async () => {
    const oldBtn = document.createElement("button");
    const settled = vi.fn();
    const lock = submitLock("t3", { buttons: [oldBtn] });
    const d = deferred();
    void lock.run(() => d.promise);
    const newBtn = document.createElement("button");
    submitLock("t3", { buttons: [newBtn], onSettled: settled });
    expect(newBtn.disabled).toBe(true);
    d.resolve();
    await tick();
    expect(newBtn.disabled).toBe(false);
    expect(settled).toHaveBeenCalledWith({ status: "ok", value: undefined });
  });

  it("reports other errors without swallowing them", async () => {
    const btn = document.createElement("button");
    const lock = submitLock("t4", { buttons: [btn] });
    const res = await lock.run(async () => { throw apiErr("server", 500); });
    expect(res.status).toBe("error");
    expect(btn.disabled).toBe(false);
  });
});

describe("formField", () => {
  it("describedBy ids come first in aria-describedby, before the hint and the visible error", () => {
    const f = formField({ id: "d", label: "Text", describedBy: ["rules"] });
    expect(f.control.getAttribute("aria-describedby")).toBe("rules");
    f.setHint("Hint.");
    f.setError("Oops.");
    expect(f.control.getAttribute("aria-describedby")).toBe("rules d-hint d-error");
    f.setError(null);
    f.setHint(null);
    expect(f.control.getAttribute("aria-describedby")).toBe("rules");
    expect(formField({ id: "e", label: "No extras" }).control.hasAttribute("aria-describedby")).toBe(false);
  });

  it("wires aria-describedby / aria-invalid and clears the error on edit", () => {
    const f = formField({ id: "g", label: "Title", hint: "Required.", required: true });
    document.body.append(f.node);
    expect(f.control.getAttribute("aria-describedby")).toBe("g-hint");
    f.setError("Give it a title.");
    expect(f.control.getAttribute("aria-describedby")).toBe("g-hint g-error");
    expect(f.control.getAttribute("aria-invalid")).toBe("true");
    expect(f.node.querySelector("label")!.getAttribute("for")).toBe(f.control.id);
    f.control.value = "x";
    f.control.dispatchEvent(new Event("input"));
    expect(f.control.hasAttribute("aria-invalid")).toBe(false);
    expect(f.control.getAttribute("aria-describedby")).toBe("g-hint");
    draftClear("field:g");
  });

  it("keeps the typed value when rebuilt after a language switch", () => {
    const build = () => formField({ id: "keep", label: t(), control: "textarea" });
    const t = () => (document.documentElement.lang === "fa" ? "عنوان" : "Title");
    const a = build();
    a.control.value = "my draft ✍️";
    a.control.dispatchEvent(new Event("input"));
    setLang("fa"); // app.ts would rebuild the view here
    const b = build();
    expect(b.getValue()).toBe("my draft ✍️");
    expect(b.node.querySelector("label")!.textContent).toBe("عنوان");
    draftClear("field:keep");
  });

  it("restores a select draft", () => {
    const opts = [{ value: "a", label: "A" }, { value: "b", label: "B" }];
    const a = formField({ id: "sel", label: "S", control: "select", options: opts });
    a.control.value = "b";
    a.control.dispatchEvent(new Event("change"));
    expect(formField({ id: "sel", label: "S", control: "select", options: opts }).getValue()).toBe("b");
    draftClear("field:sel");
  });
});

describe("confirmDialog", () => {
  const open = (opener = document.getElementById("opener") as HTMLButtonElement) => { opener.focus(); return opener; };

  it("is an alertdialog, focuses Cancel, makes #app inert, Esc closes with false and restores focus", async () => {
    const opener = open();
    const p = confirmDialog({ kind: "delete", subject: "Goal A" });
    const dlg = document.querySelector<HTMLElement>('[role="alertdialog"]')!;
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dlg.getAttribute("aria-labelledby")!)!.textContent).toBe("Delete “Goal A”?");
    expect(document.getElementById(dlg.getAttribute("aria-describedby")!)!.textContent).toBe("This can't be undone.");
    expect(document.activeElement!.textContent).toBe("Cancel");
    expect(document.getElementById("app")!.hasAttribute("inert")).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(await p).toBe(false);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.getElementById("app")!.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("traps Tab and Shift+Tab inside the dialog", async () => {
    open();
    void confirmDialog({ kind: "archive" });
    const [cancel, confirm] = Array.from(document.querySelectorAll<HTMLButtonElement>(".ui-dialog button"));
    expect(document.activeElement).toBe(cancel);
    confirm.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(cancel); // wrapped forward
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(confirm); // wrapped backward
    cancel.click();
  });

  it("resolves true on confirm and restores focus by data-focus-key if the opener was rebuilt", async () => {
    const opener = open();
    const p = confirmDialog({ kind: "logout" });
    const fresh = document.createElement("button");
    fresh.setAttribute("data-focus-key", "opener");
    opener.replaceWith(fresh); // a re-render replaced the opener
    document.querySelectorAll<HTMLButtonElement>(".ui-dialog button")[1].click();
    expect(await p).toBe(true);
    expect(document.activeElement).toBe(fresh);
  });

  it("with onConfirm: locks, ignores Esc while running, stays open and shows the error on failure", async () => {
    open();
    const d = deferred();
    const p = confirmDialog({ kind: "delete", onConfirm: () => d.promise });
    const [cancel, confirm] = Array.from(document.querySelectorAll<HTMLButtonElement>(".ui-dialog button"));
    confirm.click();
    expect(confirm.disabled && cancel.disabled).toBe(true);
    expect(confirm.textContent).toBe("Working…");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    d.reject(apiErr("server", 500));
    await tick();
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.querySelector(".ui-dialog .error-banner")!.textContent).toMatch(/server ran into a problem/i);
    expect(confirm.disabled).toBe(false);
    cancel.click();
    expect(await p).toBe(false);
  });

  it("changes language while open", async () => {
    open();
    const p = confirmDialog({ kind: "logout" });
    setLang("fa");
    expect(document.querySelector(".ui-dialog__title")!.textContent).toBe("از حساب خارج می‌شوی؟");
    expect(document.querySelectorAll(".ui-dialog button")[1].textContent).toBe("خروج");
    document.querySelectorAll<HTMLButtonElement>(".ui-dialog button")[0].click();
    await p;
  });
});

describe("reviewAndConfirm", () => {
  interface It { item: string; urgency: number }
  const mk = (items: It[], onConfirm: (x: It[]) => Promise<void>, onCancel = () => {}) =>
    reviewAndConfirm<It>({
      key: "bd",
      items,
      itemLabel: (i) => i.item,
      renderItem: (i, ctx) => {
        const f = formField({ id: ctx.fieldId("text"), label: "Item", value: i.item, onInput: (v) => ctx.update({ item: v }) });
        return f.node;
      },
      confirmLabel: (n) => `Save ${n}`,
      onConfirm,
      onCancel,
    });
  const proposal = (): It[] => [{ item: "a", urgency: 1 }, { item: "b", urgency: 2 }, { item: "c", urgency: 3 }];

  it("shows the not-saved notice, edits + removals persist across a rebuild, confirm sends edited items once", async () => {
    const items = proposal();
    const d = deferred();
    const onConfirm = vi.fn((_x: It[]) => d.promise);
    let node = mk(items, onConfirm);
    document.body.append(node);
    expect(node.querySelector(".ui-review__notice")!.textContent).toMatch(/Nothing is saved until you confirm/);
    expect(node.querySelector('[role="note"]')).not.toBeNull();

    // edit item 0, remove item 1
    const input = node.querySelectorAll<HTMLInputElement>("input")[0];
    input.value = "a-edited";
    input.dispatchEvent(new Event("input"));
    node.querySelectorAll<HTMLButtonElement>(".ui-review__remove")[1].click();
    expect(node.querySelectorAll(".ui-review__item").length).toBe(2);
    expect(node.querySelector<HTMLElement>('[aria-live="polite"][role="status"]')!.textContent).toBe("Removed: b. 2 left.");

    // language switch -> rebuild with the SAME items array
    setLang("fa");
    node.remove();
    node = mk(items, onConfirm);
    document.body.append(node);
    expect(node.querySelectorAll(".ui-review__item").length).toBe(2);
    expect(node.querySelectorAll<HTMLInputElement>("input")[0].value).toBe("a-edited");
    expect(node.querySelector(".ui-review__notice")!.textContent).toMatch(/تأیید نکنی/);

    const [cancel, confirm] = Array.from(node.querySelectorAll<HTMLButtonElement>(".ui-review__actions button"));
    expect(confirm.textContent).toBe("Save 2");
    confirm.click();
    confirm.click(); // double click
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].map((i) => i.item)).toEqual(["a-edited", "c"]);
    expect(confirm.disabled && cancel.disabled).toBe(true);
    expect(node.querySelector<HTMLFieldSetElement>("fieldset")!.disabled).toBe(true);
    d.resolve();
    await tick();
  });

  it("keeps edits and shows a translated error when confirm fails", async () => {
    const items = proposal();
    const node = mk(items, async () => { throw apiErr("llm_unavailable", 503); });
    document.body.append(node);
    node.querySelector<HTMLButtonElement>(".ui-review__actions .btn-primary")!.click();
    await tick();
    expect(node.querySelector(".error-banner")!.textContent).toMatch(/AI assistant isn't available/);
    expect(node.querySelectorAll(".ui-review__item").length).toBe(3);
    expect(node.querySelector<HTMLButtonElement>(".ui-review__actions .btn-primary")!.disabled).toBe(false);
    expect(node.querySelector<HTMLFieldSetElement>("fieldset")!.disabled).toBe(false);
  });

  it("a new proposal (new array) starts fresh; removing everything disables confirm", async () => {
    const first = proposal();
    let node = mk(first, async () => {});
    document.body.append(node);
    node.querySelectorAll<HTMLButtonElement>(".ui-review__remove")[0].click();
    node.remove();
    node = mk(proposal(), async () => {}); // different array
    expect(node.querySelectorAll(".ui-review__item").length).toBe(3);
    document.body.append(node);
    for (let i = 0; i < 3; i++) node.querySelector<HTMLButtonElement>(".ui-review__remove")!.click();
    expect(node.querySelector<HTMLButtonElement>(".ui-review__actions .btn-primary")!.disabled).toBe(true);
    expect(node.querySelector<HTMLElement>(".ui-review__empty")!.hidden).toBe(false);
  });

  it("cancel discards the draft and calls onCancel", () => {
    const items = proposal();
    const onCancel = vi.fn();
    const node = mk(items, async () => {}, onCancel);
    document.body.append(node);
    node.querySelectorAll<HTMLButtonElement>(".ui-review__remove")[0].click();
    node.querySelector<HTMLButtonElement>(".ui-review__actions .btn-secondary")!.click();
    expect(onCancel).toHaveBeenCalled();
    expect(mk(items, async () => {}).querySelectorAll(".ui-review__item").length).toBe(3);
  });
});

describe("asyncPanel", () => {
  const base = { id: "p", render: () => document.createTextNode("DATA") };
  const empty = { title: "No goals", nextStep: "Talk to the mentor.", action: { label: "Go to chat", onClick: () => {} } };

  it("loading shows a skeleton (aria-hidden) plus an sr-only status", () => {
    const n = asyncPanel({ ...base, status: "loading", skeleton: "list", rows: 2 });
    expect(n.querySelectorAll(".ui-skeleton__row").length).toBe(2);
    expect(n.querySelector(".ui-skeleton")!.getAttribute("aria-hidden")).toBe("true");
    expect(n.getAttribute("aria-busy")).toBe("true");
    expect(n.textContent).toContain("Loading…");
  });

  it("translates the error from ApiError.kind at render time, in both languages", () => {
    const en = asyncPanel({ ...base, status: "error", error: "network" }).textContent;
    expect(en).toMatch(/Could not reach the server/);
    setLang("fa");
    expect(asyncPanel({ ...base, status: "error", error: apiErr("network") }).textContent).toMatch(/ارتباط با سرور/);
    setLang("en");
    expect(asyncPanel({ ...base, status: "error", error: apiErr("rate_limit", 429) }).textContent).toMatch(/wait a moment/);
  });

  it("offers Retry (locked while it runs) but not for an expired session", async () => {
    const d = deferred();
    const onRetry = vi.fn(() => d.promise);
    const n = asyncPanel({ ...base, status: "error", error: "server", onRetry });
    document.body.append(n);
    const btn = n.querySelector<HTMLButtonElement>("button")!;
    btn.click();
    btn.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(btn.disabled).toBe(true);
    d.resolve();
    await tick();
    expect(btn.disabled).toBe(false);
    expect(asyncPanel({ ...base, status: "error", error: "auth", onRetry }).querySelector("button")).toBeNull();
  });

  it("empty shows the guide with a working next-step action; ready renders content", () => {
    const click = vi.fn();
    const n = asyncPanel({ ...base, status: "ready", isEmpty: true, empty: { ...empty, action: { label: "Go to chat", onClick: click } } });
    expect(n.textContent).toContain("Next step:");
    n.querySelector<HTMLButtonElement>("button")!.click();
    expect(click).toHaveBeenCalled();
    expect(asyncPanel({ ...base, status: "ready" }).textContent).toBe("DATA");
  });

  it("emptyStateGuide supports href links", () => {
    const n = emptyStateGuide({ title: "T", nextStep: "N", action: { label: "Go", href: "#/goals" }, headingLevel: 2 });
    expect(n.querySelector("h2")).not.toBeNull();
    expect(n.querySelector("a")!.getAttribute("href")).toBe("#/goals");
  });

  it("emptyStateGuide: secondaryAction adds a second, secondary-styled action; without it the DOM is unchanged", () => {
    const one = emptyStateGuide({ title: "T", nextStep: "N", action: { label: "A", onClick: () => {} } });
    expect(one.querySelector(".ui-empty__actions")).toBeNull();
    expect(one.querySelectorAll(".ui-empty__cta")).toHaveLength(1);

    const click = vi.fn();
    const two = emptyStateGuide({ title: "T", nextStep: "N", action: { label: "A", onClick: () => {} }, secondaryAction: { label: "B", onClick: click } });
    const ctas = [...two.querySelectorAll<HTMLElement>(".ui-empty__actions .ui-empty__cta")];
    expect(ctas.map((c) => c.textContent)).toEqual(["A", "B"]);
    expect(ctas[0].classList.contains("btn-primary")).toBe(true);
    expect(ctas[1].classList.contains("btn-secondary")).toBe(true);
    ctas[1].click();
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe("confidenceBadge", () => {
  it("confidenceBadge maps 0..1 to a written level + percent", () => {
    expect(confidenceBadge(0.82).textContent).toBe("Confidence: High · 82%");
    expect(confidenceBadge(0.5).className).toContain("--medium");
    expect(confidenceBadge(0.1).className).toContain("--low");
    expect(confidenceBadge(NaN).className).toContain("--unknown");
    setLang("fa");
    expect(confidenceBadge(0.82).textContent).toContain("زیاد");
  });
});
