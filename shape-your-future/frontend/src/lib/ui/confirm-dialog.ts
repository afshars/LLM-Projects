import { handleAuthExpiry } from "../auth-guard";
import { el, errorMessage } from "../dom";
import { errorBanner } from "../page";
import { onThemeI18nChange, t } from "../theme-i18n";
import { journey } from "../../state/journey";
import { submitLock } from "./submit-lock";
import type { SubmitBinding } from "./submit-lock";

/**
 * confirmDialog: "Are you sure?" for delete / archive / logout.
 *
 *   if (await confirmDialog({ kind: "delete", subject: goal.title, onConfirm: () => apiClient.deleteGoal(goal.id) })) { ... }
 *   void confirmDialog({ kind: "logout", onConfirm: async () => journey.reset() });
 *
 * Resolves `true` after the user confirmed (and `onConfirm`, if given,
 * succeeded) and `false` on cancel / Esc. With `onConfirm` the dialog stays
 * open while it runs (buttons locked, Esc ignored), shows the error and stays
 * open if it fails, and shows "please wait" on a 429.
 *
 * Accessibility: role="alertdialog" + aria-modal, labelled and described;
 * initial focus on Cancel (the safe choice; override with `initialFocus`);
 * Tab/Shift+Tab are trapped; the rest of the app (#app) is made inert;
 * Esc closes; focus returns to the opener (found again by `data-focus-key` if
 * a re-render replaced it, else the main view). Text given as a function is
 * re-evaluated on a language switch, so the open dialog changes language too.
 */

export type DialogKind = "delete" | "archive" | "logout" | "custom";
type Text = string | (() => string);

export interface ConfirmDialogOptions {
  /** Picks default copy (and the danger style for "delete"). Default "custom". */
  kind?: DialogKind;
  /** Name of the thing being deleted/archived, shown in the default title. */
  subject?: string;
  title?: Text;
  message?: Text;
  confirmLabel?: Text;
  cancelLabel?: Text;
  onConfirm?: () => Promise<unknown> | unknown;
  initialFocus?: "cancel" | "confirm";
  /** Where focus goes on close. Default: the element focused when opened. */
  returnFocusTo?: HTMLElement | null;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const resolve = (text: Text | undefined, fallback: () => string): string => (typeof text === "function" ? text() : (text ?? fallback()));

let active: { close(result: boolean): void } | null = null;
let counter = 0;

export function confirmDialog(o: ConfirmDialogOptions = {}): Promise<boolean> {
  active?.close(false); // one dialog at a time
  const kind = o.kind ?? "custom";

  return new Promise<boolean>((resolvePromise) => {
    const uid = ++counter;
    const titleId = `ui-dialog-title-${uid}`;
    const descId = `ui-dialog-desc-${uid}`;
    const opener = o.returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const openerKey = opener?.getAttribute("data-focus-key") ?? null;

    /** Default copy for the kind, read from the CURRENT language every call. */
    const copy = () => {
      const d = t().ui.dialog;
      switch (kind) {
        case "delete": return { title: d.delete.title(o.subject), message: d.delete.message, confirm: d.delete.confirm };
        case "archive": return { title: d.archive.title(o.subject), message: d.archive.message, confirm: d.archive.confirm };
        case "logout": return { title: d.logout.title, message: d.logout.message, confirm: d.logout.confirm };
        default: return { title: d.generic.title, message: d.generic.message, confirm: d.generic.confirm };
      }
    };

    // ---------- DOM ----------
    const titleEl = el("h2", { class: "ui-dialog__title", id: titleId, dir: "auto" });
    const messageEl = el("p", { class: "ui-dialog__message", id: descId, dir: "auto" });
    const errorSlot = el("div", { class: "form-slot" });
    const statusEl = el("p", { class: "ui-dialog__status" });
    const cancelBtn = el("button", { class: "btn-secondary", type: "button" }) as HTMLButtonElement;
    const confirmBtn = el("button", { class: kind === "delete" ? "ui-btn-danger" : "btn-primary", type: "button" }) as HTMLButtonElement;
    const dialog = el(
      "div",
      { class: "ui-dialog", role: "alertdialog", "aria-modal": "true", "aria-labelledby": titleId, "aria-describedby": descId, tabindex: "-1" },
      [titleEl, messageEl, errorSlot, statusEl, el("div", { class: "ui-dialog__actions" }, [cancelBtn, confirmBtn])]
    );
    const backdrop = el("div", { class: "ui-dialog-backdrop" }, [dialog]);

    const cancelText = () => resolve(o.cancelLabel, () => t().ui.dialog.cancel);
    const confirmText = () => resolve(o.confirmLabel, () => copy().confirm);

    let closed = false;
    const focusInitial = () => (o.initialFocus === "confirm" ? confirmBtn : cancelBtn).focus();

    // ---------- Locking (only used when onConfirm is given) ----------
    const binding: SubmitBinding = {
      buttons: [cancelBtn, confirmBtn],
      primary: confirmBtn,
      idleLabel: confirmText,
      busyLabel: () => t().ui.dialog.working,
      status: statusEl,
      onChange: (locked) => {
        if (closed) return;
        if (locked) dialog.focus(); // a disabled button cannot keep focus: keep it inside the dialog
        else focusInitial();
      },
      onSettled: (result) => {
        if (closed) return;
        if (result.status === "ok") close(true);
        else if (result.status === "error") {
          if (handleAuthExpiry(result.error)) return close(false);
          errorSlot.replaceChildren(errorBanner(errorMessage(result.error)));
        }
      },
    };
    const lockKey = `dialog:${kind}`;
    let lock = submitLock(lockKey, binding);

    function paintText(): void {
      const c = copy();
      titleEl.textContent = resolve(o.title, () => c.title);
      messageEl.textContent = resolve(o.message, () => c.message);
      cancelBtn.textContent = cancelText();
      if (lock.isLocked()) lock = submitLock(lockKey, binding); // re-bind: repaints busy label
      else confirmBtn.textContent = confirmText();
    }

    // ---------- Behaviour ----------
    confirmBtn.addEventListener("click", () => {
      if (!o.onConfirm) return close(true);
      errorSlot.replaceChildren();
      const run = o.onConfirm;
      void lock.run(async () => {
        await run();
      });
    });
    cancelBtn.addEventListener("click", () => close(false));

    function onKeydown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!lock.isLocked()) close(false); // never abandon a request that is running
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (!dialog.contains(current) || (e.shiftKey && (current === first || current === dialog))) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    }

    // ---------- Open / close ----------
    const appRoot = document.getElementById("app");
    const wasInert = appRoot?.hasAttribute("inert") ?? false;
    appRoot?.setAttribute("inert", "");
    document.documentElement.classList.add("ui-scroll-lock");
    document.addEventListener("keydown", onKeydown, true);
    const stopLang = onThemeI18nChange(paintText);
    // A session that expires behind the dialog must not leave it floating over the login page.
    const stopJourney = journey.subscribe((s) => {
      if (s.step === "AUTH" && !lock.isLocked()) close(false);
    });

    function close(result: boolean): void {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKeydown, true);
      stopLang();
      stopJourney();
      backdrop.remove();
      if (!wasInert) appRoot?.removeAttribute("inert"); // must happen BEFORE focusing outside the dialog
      document.documentElement.classList.remove("ui-scroll-lock");
      active = null;

      const byKey = openerKey ? Array.from(document.querySelectorAll<HTMLElement>("[data-focus-key]")).find((n) => n.getAttribute("data-focus-key") === openerKey) : null;
      const target = opener?.isConnected ? opener : (byKey ?? document.getElementById("view"));
      target?.focus({ preventScroll: true });
      resolvePromise(result);
    }

    active = { close };
    paintText();
    document.body.append(backdrop);
    focusInitial();
  });
}
