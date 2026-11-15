// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initThemeI18n, setLang } from "../src/lib/theme-i18n";
import { reviewAndConfirm } from "../src/lib/ui";
import type { ReviewAndConfirmOptions } from "../src/lib/ui/review-and-confirm";
import { draftClear } from "../src/lib/ui/drafts";
import type { ApiError } from "../src/api/types";

/**
 * Part 11b-4a: the backward-compatible options added to the shared reviewAndConfirm: readonly `items`,
 * `removable`, `showErrors`, `frozen`, `blockedReason`, `headingLevel`, and aria-busy on the panel.
 * The defaults must behave exactly as before (the original tests are in ui.test.ts).
 */

const tick = () => new Promise((r) => setTimeout(r, 0));
const deferred = <T = void>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
const apiErr = (kind: ApiError["kind"]): ApiError => ({ kind, status: null, message: "" });

interface It {
  item: string;
}
const items = (): readonly It[] => Object.freeze([Object.freeze({ item: "a" }), Object.freeze({ item: "b" })]);

let n = 0;
const mk = (extra: Partial<ReviewAndConfirmOptions<It>> = {}) => {
  const key = `opt${++n}`; // a fresh key (lock + draft) per test
  const node = reviewAndConfirm<It>({
    key,
    items: items(),
    itemLabel: (i) => i.item,
    renderItem: (i) => document.createTextNode(i.item),
    onConfirm: async () => {},
    onCancel: () => {},
    ...extra,
  });
  document.body.append(node);
  return { node, key };
};
const confirm = (node: HTMLElement) => node.querySelector<HTMLButtonElement>(".ui-review__actions .btn-primary")!;
const cancel = (node: HTMLElement) => node.querySelector<HTMLButtonElement>(".ui-review__actions .btn-secondary")!;

beforeEach(() => {
  document.body.innerHTML = "";
  initThemeI18n();
  setLang("en");
});
afterEach(() => vi.useRealTimers());

describe("reviewAndConfirm: defaults are unchanged", () => {
  it("accepts a readonly array and never mutates it; Remove buttons, h2 title and aria-busy=false are there", () => {
    const { node } = mk();
    expect(node.querySelectorAll(".ui-review__remove")).toHaveLength(2);
    expect(node.querySelector(".ui-review__title")!.tagName).toBe("H2");
    expect(node.getAttribute("aria-busy")).toBe("false");
    expect(node.querySelector(".ui-review__blocked")).not.toBeNull();
    expect(node.querySelector<HTMLElement>(".ui-review__blocked")!.hidden).toBe(true);
    expect(confirm(node).getAttribute("aria-describedby")).not.toMatch(/blocked/);
  });

  it("a failed confirm still shows the generic error banner and unlocks", async () => {
    const { node } = mk({ onConfirm: () => Promise.reject(apiErr("server")) });
    confirm(node).click();
    await tick();
    expect(node.querySelector(".form-slot")!.textContent).not.toBe("");
    expect(confirm(node).disabled).toBe(false);
  });
});

describe("reviewAndConfirm: new options", () => {
  it("removable: false -> no Remove buttons at all", () => {
    const { node } = mk({ removable: false });
    expect(node.querySelectorAll(".ui-review__remove")).toHaveLength(0);
    expect(node.querySelectorAll(".ui-review__item")).toHaveLength(2);
  });

  it("headingLevel: 3 -> the title is an h3 (still the panel's accessible name)", () => {
    const { node } = mk({ headingLevel: 3, title: "Items" });
    const h = node.querySelector(".ui-review__title")!;
    expect(h.tagName).toBe("H3");
    expect(node.getAttribute("aria-labelledby")).toBe(h.id);
  });

  it("showErrors: false -> a failure shows NO banner, still unlocks, and the 429 'please wait' still works", async () => {
    const { node } = mk({ showErrors: false, onConfirm: () => Promise.reject(apiErr("server")) });
    confirm(node).click();
    await tick();
    expect(node.querySelector(".form-slot")!.children).toHaveLength(0);
    expect(confirm(node).disabled).toBe(false);

    const rl = mk({ showErrors: false, onConfirm: () => Promise.reject(apiErr("rate_limit")) });
    confirm(rl.node).click();
    await tick();
    expect(rl.node.querySelector(".ui-review__status")!.textContent).toMatch(/wait a moment/i);
  });

  it("frozen: Confirm and every item control stay disabled, a forced click sends nothing, Discard still works", async () => {
    const onConfirm = vi.fn(async () => {});
    const onCancel = vi.fn();
    const { node } = mk({ frozen: true, onConfirm, onCancel });
    expect(confirm(node).disabled).toBe(true);
    expect(node.querySelector<HTMLFieldSetElement>("fieldset")!.disabled).toBe(true);
    confirm(node).click();
    await tick();
    expect(onConfirm).not.toHaveBeenCalled();
    cancel(node).click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("blockedReason: Confirm is disabled, the reason is visible and described, a forced click sends nothing", async () => {
    const onConfirm = vi.fn(async () => {});
    const { node } = mk({ blockedReason: "Finish the open edit first.", onConfirm });
    const why = node.querySelector<HTMLElement>(".ui-review__blocked")!;
    expect(why.hidden).toBe(false);
    expect(why.textContent).toBe("Finish the open edit first.");
    expect(confirm(node).disabled).toBe(true);
    expect(confirm(node).getAttribute("aria-describedby")).toContain(why.id);
    confirm(node).click();
    await tick();
    expect(onConfirm).not.toHaveBeenCalled();
    // the items themselves stay editable (only Confirm is blocked)
    expect(node.querySelector<HTMLFieldSetElement>("fieldset")!.disabled).toBe(false);
  });

  it("aria-busy is true on the panel while the request runs and false after; Confirm and Discard are off meanwhile", async () => {
    const d = deferred();
    const { node } = mk({ onConfirm: () => d.promise });
    confirm(node).click();
    await tick();
    expect(node.getAttribute("aria-busy")).toBe("true");
    expect(confirm(node).disabled).toBe(true);
    expect(cancel(node).disabled).toBe(true);
    expect(node.querySelector<HTMLFieldSetElement>("fieldset")!.disabled).toBe(true);
    d.resolve();
    await tick();
    expect(node.getAttribute("aria-busy")).toBe("false");
    expect(confirm(node).disabled).toBe(false);
  });

  it("aria-busy is NOT left on during the 429 cooldown (nothing is loading then)", async () => {
    const { node } = mk({ onConfirm: () => Promise.reject(apiErr("rate_limit")) });
    confirm(node).click();
    await tick();
    expect(confirm(node).disabled).toBe(true); // cooling down
    expect(node.getAttribute("aria-busy")).toBe("false");
  });

  it("rebuilt while a request runs (language change): the new panel starts busy and locked", async () => {
    const d = deferred();
    const { node, key } = mk({ onConfirm: () => d.promise });
    confirm(node).click();
    await tick();
    node.remove();
    const again = reviewAndConfirm<It>({
      key,
      items: items(),
      itemLabel: (i) => i.item,
      renderItem: (i) => document.createTextNode(i.item),
      onConfirm: async () => {},
      onCancel: () => {},
    });
    document.body.append(again);
    expect(again.getAttribute("aria-busy")).toBe("true");
    expect(confirm(again).disabled).toBe(true);
    expect(cancel(again).disabled).toBe(true);
    expect(again.querySelector<HTMLFieldSetElement>("fieldset")!.disabled).toBe(true);
    d.resolve();
    await tick();
    expect(again.getAttribute("aria-busy")).toBe("false");
    draftClear(`review:${key}`);
  });
});
