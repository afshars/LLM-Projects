import { journey } from "./journey";

/**
 * The optional focus timer of the Today screen (Laser): "work on the Highlight for N minutes, nothing else".
 *
 * It is deliberately small and lives only in the browser: no request, no account data, no score. It stores the END
 * time (not a counter), so it stays right when the tab is in the background, when the language is switched (the
 * view is rebuilt) and after a reload. Only the visible countdown ticks (the view runs a 1 s interval while it is
 * on screen); nothing runs in the background and nothing pushes a notification.
 *
 * It is the only focus timer in the app: the old backend-tracked focus session was removed.
 */

export const TIMER_MINUTES = [15, 25, 50] as const;
export const DEFAULT_TIMER_MINUTES = 25;

const STORAGE_KEY = "maketime:focus-timer";

interface Stored {
  endsAt: number;
  minutes: number;
}

export type TimerView =
  | { phase: "idle" }
  | { phase: "running"; minutes: number; remainingMs: number }
  | { phase: "finished"; minutes: number };

type Listener = () => void;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** The timer as the screen shows it at `now` (epoch ms). */
export function timerView(stored: Stored | null, now: number): TimerView {
  if (!stored) return { phase: "idle" };
  const remainingMs = stored.endsAt - now;
  return remainingMs > 0 ? { phase: "running", minutes: stored.minutes, remainingMs } : { phase: "finished", minutes: stored.minutes };
}

/** "MM:SS" for a countdown (rounded UP to the second, so it never shows 00:00 while time is left). */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isStored(value: unknown): value is Stored {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.endsAt === "number" && Number.isFinite(v.endsAt) && typeof v.minutes === "number" && Number.isFinite(v.minutes);
}

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStored(parsed) ? parsed : null;
  } catch {
    return null; // storage blocked or the value is not ours: no timer
  }
}

function writeStored(value: Stored | null) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage is a convenience (survives a reload); the timer still works without it.
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

class FocusTimerStore {
  private stored: Stored | null = readStored();
  private listeners: Listener[] = [];

  view(now: number = Date.now()): TimerView {
    return timerView(this.stored, now);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private change(next: Stored | null) {
    this.stored = next;
    writeStored(next);
    for (const listener of this.listeners) listener();
  }

  /** Starts a countdown of `minutes` (one of TIMER_MINUTES). Replaces a timer that is already set. */
  start(minutes: number, now: number = Date.now()): void {
    const allowed = (TIMER_MINUTES as readonly number[]).includes(minutes) ? minutes : DEFAULT_TIMER_MINUTES;
    this.change({ endsAt: now + allowed * 60_000, minutes: allowed });
  }

  /** Stops a running timer, or dismisses a finished one. */
  clear(): void {
    if (this.stored === null) return;
    this.change(null);
  }

  /** Forget everything (logout): the next person starts with no timer. */
  reset(): void {
    this.clear();
  }
}

export const focusTimerStore = new FocusTimerStore();

let previousStep = journey.get().step;
journey.subscribe((s) => {
  if (s.step === "AUTH" && previousStep !== "AUTH") focusTimerStore.reset();
  previousStep = s.step;
});
