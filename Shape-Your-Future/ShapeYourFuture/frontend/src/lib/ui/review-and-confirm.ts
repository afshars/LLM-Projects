import { handleAuthExpiry } from "../auth-guard";
import { el, errorMessage } from "../dom";
import { errorBanner } from "../page";
import { getLocale, t } from "../theme-i18n";
import { draftClear, draftGet, draftSet } from "./drafts";
import { clearFieldDraftsByPrefix } from "./form-field";
import { submitLock } from "./submit-lock";

/**
 * reviewAndConfirm: the "AI proposes, you confirm" step (brain-dump,
 * plan/propose, progress-check, growth/run all only PROPOSE; nothing is
 * saved until the matching `.../confirm` call).
 *
 *   reviewAndConfirm<BrainDumpItem>({
 *     key: "brain-dump",
 *     items: state.proposal.items,               // keep this array reference stable (store state)
 *     itemLabel: (it) => it.item,
 *     renderItem: (it, ctx) => {
 *       const f = formField({ id: ctx.fieldId("text"), label: "Item", value: it.item, onInput: (v) => ctx.update({ item: v }) });
 *       return f.node;
 *     },
 *     onConfirm: (items) => apiClient.confirmBrainDump({ items }),   // throw = show error, stay open
 *     onCancel: () => journey.goTo("COACH"),
 *   })
 *
 *  - Shows a clear "nothing is saved until you confirm" notice.
 *  - Items are editable (via renderItem + ctx.update) and removable.
 *  - Edits and removals live in the draft store, so a language switch (view
 *    rebuild) keeps them. A NEW `items` array = a new proposal = fresh draft.
 *  - Confirm/Cancel and all item controls are disabled while submitting;
 *    a second click is ignored (submitLock); 429 shows "please wait" and
 *    re-enables after a short delay; other errors show a banner and keep the
 *    user's edits so they can retry.
 */

export interface ReviewItemContext<T> {
  index: number;
  /** Store an edit. Does not re-render, so focus and caret are kept. */
  update(patch: Partial<T>): void;
  /** A field id unique to this item AND this proposal: use it for formField ids. */
  fieldId(name: string): string;
}

export interface ReviewAndConfirmOptions<T extends object> {
  /** Stable key for this flow (draft + lock). */
  key: string;
  /** Never mutated: the component works on its own copies. */
  items: readonly T[];
  /** Short text naming an item, for the Remove button and announcements. */
  itemLabel: (item: T) => string;
  renderItem: (item: T, ctx: ReviewItemContext<T>) => Node;
  /** Receives the edited, non-removed items. Throw (e.g. ApiError) to fail. */
  onConfirm: (items: T[]) => Promise<void>;
  onCancel: () => void;
  title?: string;
  /** Default "Confirm and save". A function receives the number of items left. */
  confirmLabel?: string | ((count: number) => string);
  cancelLabel?: string;
  /** Confirm stays disabled below this many items. Default 1. */
  minItems?: number;
  /** Heading level of the title. Default 2; use 3 when the panel sits under another h2. */
  headingLevel?: 2 | 3;
  /** Default true. false = no built-in Remove button: the caller owns removal (e.g. its own state + confirm dialog). */
  removable?: boolean;
  /** Default true. false = a failed confirm shows NO banner here (the caller shows its own error UI). The 401 hand-off
   * to the session guard and the 429 "please wait" still happen. */
  showErrors?: boolean;
  /** Read-only and not confirmable (e.g. already saved). Confirm and every item control stay disabled. */
  frozen?: boolean;
  /** Already saved: the "nothing is saved yet" notice and the Confirm / Cancel row are hidden (they would say the opposite
   * of what happened). Implies read-only, like `frozen`. */
  saved?: boolean;
  /** When set, Confirm is disabled and this text is shown (and read by screen readers) as the reason. */
  blockedReason?: string | null;
}

interface Entry<T> {
  uid: string;
  value: T;
}
interface Draft<T> {
  source: readonly T[];
  nonce: number;
  entries: Entry<T>[];
}

let proposals = 0;
let ids = 0;

export function reviewAndConfirm<T extends object>(o: ReviewAndConfirmOptions<T>): HTMLElement {
  const dict = t();
  const r = dict.ui.review;
  const number = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 0 });
  const minItems = o.minItems ?? 1;
  const removable = o.removable ?? true;
  const showErrors = o.showErrors ?? true;
  const saved = o.saved ?? false;
  const frozen = (o.frozen ?? false) || saved;
  const blockedReason = o.blockedReason ?? null;
  const draftKey = `review:${o.key}`;
  const uid = ++ids;

  // Same `items` array as last render -> restore the user's edits; otherwise start fresh.
  let draft = draftGet<Draft<T>>(draftKey);
  if (!draft || draft.source !== o.items) {
    const nonce = ++proposals;
    draft = { source: o.items, nonce, entries: o.items.map((value, i) => ({ uid: `p${nonce}-${i}`, value: { ...value } })) };
    draftSet(draftKey, draft);
  }
  const state = draft;

  const titleId = `ui-review-title-${uid}`;
  const noticeId = `ui-review-notice-${uid}`;
  const blockedId = `ui-review-blocked-${uid}`;

  // ---------- Parts ----------
  const title = el(o.headingLevel === 3 ? "h3" : "h2", { class: "ui-review__title", id: titleId, tabindex: "-1" }, [o.title ?? r.title]);
  const notice = el("div", { class: "ui-review__notice", id: noticeId, role: "note" }, [
    el("strong", {}, [r.notSaved]),
    " ",
    r.notSavedHint,
  ]);
  notice.hidden = saved;
  const blockedEl = el("p", { class: "ui-review__blocked", id: blockedId }, [blockedReason ?? ""]);
  blockedEl.hidden = blockedReason === null;
  const list = el("ul", { class: "ui-review__list", "aria-label": r.itemsLabel });
  const emptyNote = el("p", { class: "ui-review__empty" }, [r.allRemoved]);
  const fieldset = el("fieldset", { class: "ui-review__fieldset" }, [list, emptyNote]);
  const announcer = el("div", { class: "sr-only", "aria-live": "polite", role: "status" });
  const errorSlot = el("div", { class: "form-slot" });
  const statusEl = el("p", { class: "ui-review__status" });
  const cancelBtn = el("button", { class: "btn-secondary", type: "button" }, [o.cancelLabel ?? r.cancel]) as HTMLButtonElement;
  const confirmBtn = el("button", { class: "btn-primary", type: "button", "aria-describedby": blockedReason === null ? noticeId : `${noticeId} ${blockedId}` }) as HTMLButtonElement;

  const confirmText = (): string => {
    const label = o.confirmLabel ?? r.confirm;
    return typeof label === "function" ? label(state.entries.length) : label;
  };
  const belowMin = () => state.entries.length < minItems;
  /** Why Confirm cannot be used right now, apart from a running request. */
  const confirmOff = () => belowMin() || frozen || blockedReason !== null;

  const root = el("section", { class: "ui-review", "aria-labelledby": titleId, "aria-busy": "false" });

  // ---------- Submit ----------
  const lock = submitLock(`review:${o.key}`, {
    buttons: [cancelBtn, confirmBtn],
    primary: confirmBtn,
    idleLabel: confirmText,
    busyLabel: r.saving,
    status: statusEl,
    onChange: (locked) => {
      fieldset.disabled = locked || frozen; // freezes every item control (inputs + Remove) natively
      // The whole panel is busy while the request RUNS (not during the 429 cooldown, when `locked` is still true but
      // nothing is loading): submitLock writes exactly that onto the primary button just before calling us.
      root.setAttribute("aria-busy", confirmBtn.getAttribute("aria-busy") ?? "false");
      if (!locked) confirmBtn.disabled = confirmOff();
    },
    onSettled: (result) => {
      if (result.status === "ok") {
        draftClear(draftKey);
        clearFieldDraftsByPrefix(`${o.key}:p${state.nonce}-`);
      } else if (result.status === "error") {
        if (handleAuthExpiry(result.error)) return;
        if (showErrors) errorSlot.replaceChildren(errorBanner(errorMessage(result.error)));
      }
    },
  });

  confirmBtn.addEventListener("click", () => {
    if (confirmOff()) return;
    errorSlot.replaceChildren();
    const remaining = state.entries.map((e) => e.value);
    void lock.run(() => o.onConfirm(remaining));
  });
  cancelBtn.addEventListener("click", () => {
    if (lock.isLocked()) return;
    draftClear(draftKey);
    clearFieldDraftsByPrefix(`${o.key}:p${state.nonce}-`);
    o.onCancel();
  });

  // ---------- List ----------
  function syncFooter(): void {
    emptyNote.hidden = state.entries.length > 0;
    confirmBtn.textContent = confirmText();
    if (!lock.isLocked()) confirmBtn.disabled = confirmOff();
  }

  function drawItem(entry: Entry<T>, index: number): HTMLElement {
    const label = o.itemLabel(entry.value);
    const ctx: ReviewItemContext<T> = {
      index,
      update: (patch) => {
        entry.value = { ...entry.value, ...patch };
      },
      fieldId: (name) => `${o.key}:${entry.uid}:${name}`,
    };
    const remove = el("button", { class: "btn-ghost ui-review__remove", type: "button", "aria-label": r.removeAria(label) }, [r.remove]);
    remove.addEventListener("click", () => removeEntry(entry.uid));
    const body = el("div", { class: "ui-review__body" }, [o.renderItem(entry.value, ctx)]);
    return el("li", { class: "ui-review__item" }, removable ? [body, remove] : [body]);
  }

  function drawList(): void {
    list.replaceChildren(...state.entries.map(drawItem));
    syncFooter();
  }

  function removeEntry(entryUid: string): void {
    const at = state.entries.findIndex((e) => e.uid === entryUid);
    if (at < 0 || lock.isLocked() || frozen) return;
    const [gone] = state.entries.splice(at, 1);
    drawList();
    announcer.textContent = r.removed(o.itemLabel(gone.value), number.format(state.entries.length));
    // Keep keyboard focus useful: the next item's Remove, else the previous, else the heading.
    const buttons = list.querySelectorAll<HTMLButtonElement>(".ui-review__remove");
    (buttons[at] ?? buttons[at - 1] ?? title).focus();
  }

  drawList();
  fieldset.disabled = lock.isLocked() || frozen; // rebuilt while a request runs: the lock already repainted, keep it so
  root.setAttribute("aria-busy", confirmBtn.getAttribute("aria-busy") ?? "false"); // rebuilt mid-request: the lock already repainted the new button

  const actions = el("div", { class: "ui-review__actions" }, [cancelBtn, confirmBtn]);
  actions.hidden = saved;
  root.append(title, notice, fieldset, blockedEl, announcer, errorSlot, statusEl, actions);
  return root;
}
