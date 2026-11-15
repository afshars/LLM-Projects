import { apiClient } from "../api/client";
import type { ApiError, CoachTactic, TacticSuggestion } from "../api/types";
import { handleAuthExpiry } from "../lib/auth-guard";
import { isApiError } from "../lib/dom";
import { journey } from "./journey";
import { localDay, todayStore } from "./today";

/**
 * State of the Coach tactic card: ONE tactic for today's obstacle.
 *
 *   idle        -> the user describes the obstacle
 *   suggesting  -> the AI is picking (nothing is saved)
 *   suggested   -> a tactic is shown; the user must press "Use this tactic" or "Not this one"
 *   needsMore   -> the obstacle was too vague; ask for a bit more
 *   confirming  -> the user accepted; the save request is running
 *   confirmed   -> saved (only ever after the user's explicit confirm)
 *
 * The AI output lives only in `suggestion` until confirm() succeeds: closing the app or switching language loses
 * nothing that was saved and saves nothing that was not accepted. The store keeps state outside the view because
 * app.ts rebuilds views on every language change. No DOM and no translated text here.
 */

export type CoachPhase = "idle" | "suggesting" | "suggested" | "needsMore" | "confirming" | "confirmed";

export interface CoachTacticState {
  /** The saved tactic of today is being read (first paint only). */
  loading: boolean;
  phase: CoachPhase;
  suggestion: TacticSuggestion | null;
  confirmed: { tactic: CoachTactic; blockerType: string | null } | null;
  /** Failure of the last request (suggest, confirm or the first read), shown with a retry. */
  error: ApiError | null;
}

const empty = (): CoachTacticState => ({
  loading: false,
  phase: "idle",
  suggestion: null,
  confirmed: null,
  error: null,
});

type Listener = (s: CoachTacticState) => void;

class CoachTacticStore {
  private state: CoachTacticState = empty();
  private listeners: Listener[] = [];
  private epoch = 0; // bumped by reset(): an answer that arrives after logout must not land in the next session
  private loaded = false;

  get(): CoachTacticState {
    return this.state;
  }

  subscribe(l: Listener): () => void {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }

  private set(patch: Partial<CoachTacticState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  /** Reads today's confirmed tactic once. A failure here is not fatal: the card still works for a new suggestion. */
  async load(): Promise<void> {
    if (this.loaded || this.state.loading) return;
    const epoch = this.epoch;
    this.set({ loading: true });
    try {
      const res = await apiClient.getConfirmedTactic(localDay());
      if (epoch !== this.epoch) return;
      this.loaded = true;
      this.set({
        loading: false,
        ...(res.tactic ? { phase: "confirmed" as const, confirmed: { tactic: res.tactic, blockerType: res.blocker_type } } : {}),
      });
    } catch (err) {
      if (epoch !== this.epoch) return;
      this.set({ loading: false });
      if (handleAuthExpiry(err)) return;
    }
  }

  async suggest(obstacle: string, lang: string): Promise<void> {
    const text = obstacle.trim();
    if (!text || this.state.phase === "suggesting" || this.state.phase === "confirming") return;
    const epoch = this.epoch;
    this.set({ phase: "suggesting", error: null });
    try {
      const res = await apiClient.suggestTactic(text, lang);
      if (epoch !== this.epoch) return;
      if (res.needs_clarification || !res.tactic) this.set({ phase: "needsMore", suggestion: null });
      else this.set({ phase: "suggested", suggestion: res });
    } catch (err) {
      if (epoch !== this.epoch || handleAuthExpiry(err)) return;
      this.set({ phase: "idle", error: isApiError(err) ? err : { kind: "unknown", status: null, message: "" } });
    }
  }

  /** The user's explicit "yes". The only call that saves anything. */
  async confirm(): Promise<void> {
    const s = this.state;
    if (s.phase !== "suggested" || !s.suggestion?.tactic) return;
    const epoch = this.epoch;
    const { tactic, blocker_type } = s.suggestion;
    this.set({ phase: "confirming", error: null });
    try {
      const day = localDay();
      const res = await apiClient.confirmTactic(tactic.id, blocker_type, day);
      if (epoch !== this.epoch) return;
      const saved = res.tactic ?? tactic;
      // Today and Reflect read today's entry from their own store: hand them the saved tactic right away, so the
      // loop shows it without another request (only after the server said yes, never before).
      todayStore.adoptTactic(saved, day);
      this.set({ phase: "confirmed", suggestion: null, confirmed: { tactic: saved, blockerType: res.blocker_type } });
    } catch (err) {
      if (epoch !== this.epoch || handleAuthExpiry(err)) return;
      // Back to the suggestion: the user can press confirm again, nothing was lost.
      this.set({ phase: "suggested", error: isApiError(err) ? err : { kind: "unknown", status: null, message: "" } });
    }
  }

  /** "Not this one" / "Another obstacle": drop the suggestion (it was never saved). A confirmed tactic stays. */
  dismiss(): void {
    if (this.state.phase === "suggesting" || this.state.phase === "confirming") return;
    this.set({ phase: "idle", suggestion: null, error: null });
  }

  /** Back to the input to pick a different tactic; the confirmed one stays until a new one is confirmed. */
  startOver(): void {
    this.set({ phase: "idle", suggestion: null, error: null });
  }

  /** Called on logout / expired token. */
  reset(): void {
    this.epoch++;
    this.loaded = false;
    this.state = empty();
    for (const l of this.listeners) l(this.state);
  }
}

export const coachTacticStore = new CoachTacticStore();

// Same rule as the other stores: arriving at the login step drops the previous user's data (covers a 401 anywhere).
let previousStep = journey.get().step;
journey.subscribe((st) => {
  if (st.step === "AUTH" && previousStep !== "AUTH") coachTacticStore.reset();
  previousStep = st.step;
});
