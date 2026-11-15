import { isApiError } from "../dom";
import { t } from "../theme-i18n";

/**
 * submitLock: one in-flight request per key, buttons locked while it runs.
 *
 *  - A second click while busy is ignored (a synchronous flag, so two clicks
 *    in the same tick cannot both get through - `disabled` alone is not enough).
 *  - Buttons are disabled and the primary one shows a busy label + aria-busy.
 *  - On a 429 (ApiError.kind === "rate_limit") the lock shows "please wait a
 *    moment" and keeps the buttons disabled for `cooldownMs`, then re-enables.
 *
 * State is keyed and module-level because app.ts rebuilds the view on a
 * language switch: calling submitLock() again with the same key re-binds the
 * NEW buttons to the request that is still running, so they start disabled
 * and the result is delivered to `onSettled` of the newest binding.
 *
 * For a 429 to be detected, the `task` must let the ApiError propagate.
 */

export const RATE_LIMIT_COOLDOWN_MS = 3000;

/** A fixed string, or a function evaluated on every repaint (for count-aware
 * or translated labels). */
export type Label = string | (() => string);
const resolve = (label: Label): string => (typeof label === "function" ? label() : label);

export type SubmitResult<T> =
  | { status: "ok"; value: T }
  /** Ignored: a request with this key is already running (or cooling down). */
  | { status: "busy" }
  /** 429: the lock already showed the "please wait" message and will re-enable. */
  | { status: "rate_limited" }
  /** Any other failure. Call handleAuthExpiry(error) first, then errorMessage(error). */
  | { status: "error"; error: unknown };

export interface SubmitBinding {
  /** Every button to disable while locked. */
  buttons: HTMLButtonElement[];
  /** The main button: gets aria-busy and the busy label. */
  primary?: HTMLButtonElement;
  idleLabel?: Label;
  busyLabel?: Label;
  /** Element that receives the rate-limit message (made a polite live region). */
  status?: HTMLElement;
  /** Runs after every lock/unlock repaint: disable inputs, move focus, ... */
  onChange?: (locked: boolean) => void;
  /** Runs when a request settles, on the NEWEST binding for the key. Put result
   * handling here (not after `await lock.run()`) so it survives a re-render. */
  onSettled?: (result: SubmitResult<unknown>) => void;
  cooldownMs?: number;
}

export interface SubmitLock {
  run<T>(task: () => Promise<T>): Promise<SubmitResult<T>>;
  isLocked(): boolean;
}

interface Slot {
  busy: boolean;
  cooling: boolean;
  binding: SubmitBinding;
  refocus: HTMLElement | null;
}

const slots = new Map<string, Slot>();
const isLocked = (s: Slot) => s.busy || s.cooling;

function paint(s: Slot): void {
  const b = s.binding;
  const locked = isLocked(s);
  for (const btn of b.buttons) btn.disabled = locked;
  if (b.primary) {
    b.primary.setAttribute("aria-busy", String(s.busy));
    if (b.idleLabel !== undefined && b.busyLabel !== undefined) {
      b.primary.textContent = resolve(s.busy ? b.busyLabel : b.idleLabel);
    }
  }
  if (b.status) {
    b.status.setAttribute("role", "status");
    b.status.setAttribute("aria-live", "polite");
    b.status.textContent = s.cooling ? t().errors.rateLimit : "";
  }
  b.onChange?.(locked);
}

/** Frees the slot once nothing is pending and gives keyboard focus back if
 * disabling the focused button dropped it to <body>. */
function settle(key: string, s: Slot): void {
  paint(s);
  if (isLocked(s)) return;
  slots.delete(key);
  const active = document.activeElement;
  if (s.refocus?.isConnected && (!active || active === document.body)) s.refocus.focus({ preventScroll: true });
}

export function submitLock(key: string, binding: SubmitBinding): SubmitLock {
  const existing = slots.get(key);
  if (existing) {
    existing.binding = binding; // re-render during a request: re-bind and repaint
    paint(existing);
  }

  return {
    isLocked: () => {
      const s = slots.get(key);
      return !!s && isLocked(s);
    },

    async run<T>(task: () => Promise<T>): Promise<SubmitResult<T>> {
      let s = slots.get(key);
      if (s && isLocked(s)) return { status: "busy" };
      if (!s) {
        s = { busy: false, cooling: false, binding, refocus: null };
        slots.set(key, s);
      }
      const slot = s;
      const active = document.activeElement;
      slot.refocus = active instanceof HTMLElement && slot.binding.buttons.includes(active as HTMLButtonElement) ? active : null;
      slot.busy = true;
      paint(slot);

      let result: SubmitResult<T>;
      try {
        result = { status: "ok", value: await task() };
        slot.busy = false;
      } catch (error) {
        slot.busy = false;
        if (isApiError(error) && error.kind === "rate_limit") {
          slot.cooling = true;
          window.setTimeout(() => {
            slot.cooling = false;
            settle(key, slot);
          }, slot.binding.cooldownMs ?? RATE_LIMIT_COOLDOWN_MS);
          result = { status: "rate_limited" };
        } else {
          result = { status: "error", error };
        }
      }
      settle(key, slot);
      slot.binding.onSettled?.(result);
      return result;
    },
  };
}
