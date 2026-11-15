import { apiClient } from "../api/client";
import { ENERGIZE_KEYS, LASER_KEYS } from "../api/types";
import type { ApiError, CoachTactic, DailyEntry, DailyEntryPatch } from "../api/types";
import { handleAuthExpiry } from "../lib/auth-guard";
import { isApiError } from "../lib/dom";
import { journey } from "./journey";

/**
 * State of the Today screen (Highlight, Laser, Energize): today's DailyEntry.
 *
 * Why it lives here: app.ts redraws the whole view on every language / theme change, so the entry is kept in this
 * store and a rebuilt view just reads it (no request for a language switch).
 *
 * Saving is automatic and optimistic, because the screen has to take under a minute: a tap on a check changes the
 * screen at once and a PUT /daily-entry/today follows with ONLY the keys that changed. Saves are serialized (one
 * request at a time; taps made while one is running are merged into the next one), so a fast sequence of taps can
 * never arrive out of order. When a save fails the screen keeps what the user did (nothing is thrown away), says it
 * is not saved, and `retry()` sends the same change again. A 401 goes to the session guard.
 *
 * Nothing here counts, scores or keeps a streak: the entry is plain yes/no values and one sentence.
 * No DOM, no translated text: the failure is kept as an ApiError and translated when drawn.
 */

export type TodayStatus = "idle" | "loading" | "ready" | "error";

export interface TodayState {
  status: TodayStatus;
  /** Today's entry as the screen shows it (server answer + changes not yet confirmed); null before the first success. */
  entry: DailyEntry | null;
  /** Why the load failed (status "error"), else null. */
  error: ApiError | null;
  /** A save request is running or waiting. */
  saving: boolean;
  /** The last save failed; its change is kept for retry(). */
  saveError: ApiError | null;
  /** The last change is confirmed by the server and nothing newer is waiting. */
  saved: boolean;
}

const EMPTY: TodayState = { status: "idle", entry: null, error: null, saving: false, saveError: null, saved: false };

type Listener = (state: TodayState) => void;

const toApiError = (err: unknown): ApiError => (isApiError(err) ? err : { kind: "unknown", status: null, message: "" });

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** The user's local calendar day as YYYY-MM-DD (the backend's `?day=`). Not toISOString(): that is UTC. */
export function localDay(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Trim; blank means "nothing" (null), the same rule the backend applies. */
export function cleanText(value: string): string | null {
  const text = value.trim();
  return text === "" ? null : text;
}

/** Applies a change to an entry the way the backend will, so the screen can show it before the answer arrives.
 * Same rules as app/api/routes/daily_entry.py: without a Highlight there is no schedule and nothing "done". */
export function applyPatch(entry: DailyEntry, patch: DailyEntryPatch): DailyEntry {
  const next: DailyEntry = { ...entry, laser: { ...entry.laser }, energize: { ...entry.energize } };
  if ("highlight" in patch) next.highlight = patch.highlight ?? null;
  if ("highlight_done" in patch && typeof patch.highlight_done === "boolean") next.highlight_done = patch.highlight_done;
  if ("scheduled_time" in patch) next.scheduled_time = patch.scheduled_time ?? null;
  if ("energy" in patch) next.energy = patch.energy ?? null;
  if ("reflection_note" in patch) next.reflection_note = patch.reflection_note ?? null;
  if ("change_for_tomorrow" in patch) next.change_for_tomorrow = patch.change_for_tomorrow ?? null;
  for (const key of LASER_KEYS) {
    const value = patch.laser?.[key];
    if (typeof value === "boolean") next.laser[key] = value;
  }
  for (const key of ENERGIZE_KEYS) {
    const value = patch.energize?.[key];
    if (typeof value === "boolean") next.energize[key] = value;
  }
  // Same rule as the server: the answer needs a confirmed tactic that day.
  if ("tactic_applied" in patch && typeof patch.tactic_applied === "boolean" && next.tactic) next.tactic_applied = patch.tactic_applied;
  if (next.highlight === null) {
    next.highlight_done = false;
    next.scheduled_time = null;
  }
  return next;
}

/** Two changes in one: the newer value of a key wins; the nested check groups merge key by key. */
export function mergePatch(older: DailyEntryPatch, newer: DailyEntryPatch): DailyEntryPatch {
  const merged: DailyEntryPatch = { ...older, ...newer };
  if (older.laser || newer.laser) merged.laser = { ...older.laser, ...newer.laser };
  if (older.energize || newer.energize) merged.energize = { ...older.energize, ...newer.energize };
  // Clearing the Highlight also clears its schedule on the server, and the server refuses a time sent together with
  // a cleared Highlight: a time that was set earlier in the same batch is dropped.
  if (newer.highlight === null) {
    delete merged.scheduled_time;
    delete merged.highlight_done;
  }
  return merged;
}

export function isEmptyPatch(patch: DailyEntryPatch): boolean {
  return Object.keys(patch).length === 0;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

class TodayStore {
  private state: TodayState = EMPTY;
  private listeners: Listener[] = [];
  /** Bumped by every load and by reset(): an answer that left before is dropped. */
  private epoch = 0;
  /** The local day the entry was asked for (so an app left open overnight asks again). */
  private loadedDay: string | null = null;
  /** Changes made while a request was running (not sent yet). */
  private pending: DailyEntryPatch = {};
  /** A change the server refused or never got: kept for retry(). */
  private failed: DailyEntryPatch = {};
  private inFlight = false;

  get(): TodayState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private set(next: TodayState) {
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }

  /** True when load() without `force` would make a request: never loaded, or the calendar day has changed. */
  needsLoad(now: Date = new Date()): boolean {
    return this.state.status === "idle" || this.loadedDay !== localDay(now);
  }

  /** There is a change the server has not confirmed (running, waiting, or failed). */
  hasUnsaved(): boolean {
    return this.inFlight || !isEmptyPatch(this.pending) || !isEmptyPatch(this.failed);
  }

  /**
   * GET /daily-entry/today when it is needed (first visit, a new day, or `force` for "Try again").
   * Does nothing while a request is in flight or while there are unsaved changes (a reload would hide them).
   */
  async load(opts: { force?: boolean } = {}): Promise<void> {
    if (this.state.status === "loading" || this.hasUnsaved()) return;
    if (!opts.force && !this.needsLoad()) return;
    const mine = ++this.epoch;
    const day = localDay();
    this.loadedDay = day;
    this.set({ ...EMPTY, status: "loading" });
    try {
      const entry = await apiClient.getDailyEntryToday(day);
      if (mine !== this.epoch) return;
      this.set({ ...EMPTY, status: "ready", entry });
    } catch (err) {
      if (mine !== this.epoch) return;
      if (handleAuthExpiry(err)) return; // journey.reset() already cleared this store
      this.loadedDay = null; // the next visit asks again
      this.set({ ...EMPTY, status: "error", error: toApiError(err) });
    }
  }

  /** Shows the change at once and sends it (merged with anything that is waiting). Ignored before the entry is loaded. */
  save(patch: DailyEntryPatch): void {
    const entry = this.state.entry;
    if (this.state.status !== "ready" || !entry || isEmptyPatch(patch)) return;
    // A change that failed earlier goes first (the new one wins where they overlap), so retrying can never overwrite
    // something the user did afterwards.
    this.pending = mergePatch(mergePatch(this.failed, this.pending), patch);
    this.failed = {};
    this.set({ ...this.state, entry: applyPatch(entry, patch), saving: true, saveError: null, saved: false });
    void this.flush();
  }

  /** Sends the change that failed again, together with anything the user changed since. */
  retry(): void {
    if (this.inFlight || isEmptyPatch(this.failed)) return;
    this.pending = mergePatch(this.failed, this.pending);
    this.failed = {};
    this.set({ ...this.state, saving: true, saveError: null, saved: false });
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.inFlight || isEmptyPatch(this.pending)) return;
    const sending = this.pending;
    this.pending = {};
    this.inFlight = true;
    const mine = this.epoch;
    try {
      const confirmed = await apiClient.saveDailyEntryToday(sending, this.loadedDay ?? localDay());
      if (mine !== this.epoch) return;
      this.inFlight = false;
      if (!isEmptyPatch(this.pending)) {
        // More taps came in while this one was running: show the server's answer plus those, send them next.
        this.set({ ...this.state, entry: applyPatch(confirmed, this.pending), saving: true, saveError: null, saved: false });
        void this.flush();
        return;
      }
      this.set({ ...this.state, entry: confirmed, saving: false, saveError: null, saved: true });
    } catch (err) {
      if (mine !== this.epoch) return;
      this.inFlight = false;
      if (handleAuthExpiry(err)) return;
      // Keep what the user did on screen and remember it for retry(); whatever waited behind it goes with it.
      this.failed = mergePatch(sending, this.pending);
      this.pending = {};
      this.set({ ...this.state, saving: false, saveError: toApiError(err), saved: false });
    }
  }

  /** Coach just saved a tactic for `day` (the server already said yes): show it on Today / Reflect without a request.
   * A different tactic than before resets the "applied?" answer, like the server does. Ignored when the entry on screen
   * is not loaded or is another day: the next load reads it from the server anyway. */
  adoptTactic(tactic: CoachTactic, day: string): void {
    const entry = this.state.entry;
    if (this.state.status !== "ready" || !entry || entry.date !== day) return;
    const sameTactic = entry.tactic?.id === tactic.id;
    this.set({ ...this.state, entry: { ...entry, exists: true, tactic, tactic_applied: sameTactic ? entry.tactic_applied : null } });
  }

  /** Forget everything (logout / expired session). Cancels results still on the way. */
  reset(): void {
    this.epoch++;
    this.loadedDay = null;
    this.pending = {};
    this.failed = {};
    this.inFlight = false;
    this.state = EMPTY;
    for (const listener of this.listeners) listener(this.state);
  }
}

export const todayStore = new TodayStore();

// Same rule as the other stores: when the journey arrives at the login step, the previous user's day goes away.
let previousStep = journey.get().step;
journey.subscribe((s) => {
  if (s.step === "AUTH" && previousStep !== "AUTH") todayStore.reset();
  previousStep = s.step;
});
