import { apiClient } from "../api/client";
import type { ApiError, DailyEntry, RecentDay } from "../api/types";
import { handleAuthExpiry } from "../lib/auth-guard";
import { isApiError } from "../lib/dom";
import { journey } from "./journey";
import { localDay } from "./today";

/**
 * State of the "last 7 days" list on the Reflect screen: for each day only whether the Highlight was finished
 * (yes / no / that day had no Highlight). Nothing is counted, averaged or streaked, and the store has no such field.
 *
 * Today's three answers are NOT here: they are today's DailyEntry, which already lives in state/today.ts, so Today
 * and Reflect can never disagree about the same day. This store only reads the list (GET /daily-entry/recent),
 * once per calendar day or after "Try again". Past days cannot be edited, so nothing here ever writes.
 *
 * No DOM, no translated text: the failure is kept as an ApiError and translated when drawn.
 */

export type RecentStatus = "idle" | "loading" | "ready" | "error";

export interface RecentState {
  status: RecentStatus;
  /** Exactly 7 days, oldest first, the last one is the day that was asked for. Empty until the first success. */
  days: RecentDay[];
  error: ApiError | null;
}

const EMPTY: RecentState = { status: "idle", days: [], error: null };

type Listener = (state: RecentState) => void;

const toApiError = (err: unknown): ApiError => (isApiError(err) ? err : { kind: "unknown", status: null, message: "" });

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** The server's list with the row of the day on screen taken from the entry the user is editing: a tick made a
 * moment ago shows in the list at once, without asking the server again. Other rows are unchanged. */
export function withToday(days: readonly RecentDay[], entry: Pick<DailyEntry, "date" | "highlight" | "highlight_done"> | null): RecentDay[] {
  if (!entry) return [...days];
  return days.map((day) =>
    day.date === entry.date
      ? { date: day.date, highlight: entry.highlight, highlight_done: entry.highlight === null ? null : entry.highlight_done }
      : day
  );
}

/** Newest first (today on top), the way a list of recent days is read. Does not change its input. */
export function newestFirst<T extends { date: string }>(days: readonly T[]): T[] {
  return [...days].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

class RecentStore {
  private state: RecentState = EMPTY;
  private listeners: Listener[] = [];
  /** Bumped by every load and by reset(): an answer that left before is dropped. */
  private epoch = 0;
  /** The local day the list was asked for (so an app left open overnight asks again). */
  private loadedDay: string | null = null;

  get(): RecentState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private set(next: RecentState) {
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }

  /** True when load() without `force` would make a request: never loaded, or the calendar day has changed. */
  needsLoad(now: Date = new Date()): boolean {
    return this.state.status === "idle" || this.loadedDay !== localDay(now);
  }

  /** GET /daily-entry/recent when needed (first visit, a new day, or `force` for "Try again"). */
  async load(opts: { force?: boolean } = {}): Promise<void> {
    if (this.state.status === "loading") return;
    if (!opts.force && !this.needsLoad()) return;
    const mine = ++this.epoch;
    const day = localDay();
    this.loadedDay = day;
    this.set({ ...EMPTY, status: "loading" });
    try {
      const answer = await apiClient.getDailyEntryRecent(day);
      if (mine !== this.epoch) return;
      this.set({ status: "ready", days: answer.days, error: null });
    } catch (err) {
      if (mine !== this.epoch) return;
      if (handleAuthExpiry(err)) return; // journey.reset() already cleared this store
      this.loadedDay = null; // the next visit asks again
      this.set({ status: "error", days: [], error: toApiError(err) });
    }
  }

  /** Forget everything (logout / expired session). Cancels results still on the way. */
  reset(): void {
    this.epoch++;
    this.loadedDay = null;
    this.state = EMPTY;
    for (const listener of this.listeners) listener(this.state);
  }
}

export const recentStore = new RecentStore();

// Same rule as the other stores: when the journey arrives at the login step, the previous user's days go away.
let previousStep = journey.get().step;
journey.subscribe((s) => {
  if (s.step === "AUTH" && previousStep !== "AUTH") recentStore.reset();
  previousStep = s.step;
});
