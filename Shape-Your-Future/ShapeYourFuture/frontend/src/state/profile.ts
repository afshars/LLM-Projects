import { apiClient } from "../api/client";
import type { ApiError, ProfileOut } from "../api/types";
import { handleAuthExpiry } from "../lib/auth-guard";
import { isApiError } from "../lib/dom";
import { journey } from "./journey";

/** The signed-in user's account profile (GET /profile/me), kept outside the
 * view so it survives the re-render app.ts does on every language change and
 * is wiped together with the session (logout or expired token). */

export type ProfileStatus = "idle" | "loading" | "ready" | "error";

export interface ProfileState {
  status: ProfileStatus;
  profile: ProfileOut | null;
  error: ApiError | null;
}

const EMPTY: ProfileState = { status: "idle", profile: null, error: null };

type Listener = (state: ProfileState) => void;

class ProfileStore {
  private state: ProfileState = EMPTY;
  private listeners: Listener[] = [];

  get(): ProfileState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private set(next: ProfileState) {
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }

  /** Fetches the profile once; `force` refetches (used by "Try again"). */
  async load(force = false): Promise<void> {
    if (this.state.status === "loading") return;
    if (this.state.status === "ready" && !force) return;
    this.set({ status: "loading", profile: this.state.profile, error: null });
    try {
      const profile = await apiClient.getProfile();
      this.set({ status: "ready", profile, error: null });
    } catch (err) {
      if (handleAuthExpiry(err)) return; // journey.reset() already cleared this store
      this.set({ status: "error", profile: null, error: isApiError(err) ? err : { kind: "unknown", status: null, message: "" } });
    }
  }

  /** Records the server's answer to a save (PUT /profile/me, /me/avatar). */
  update(profile: ProfileOut): void {
    this.set({ status: "ready", profile, error: null });
  }

  /** Forget everything (logout / expired session). */
  reset(): void {
    this.state = EMPTY;
    for (const listener of this.listeners) listener(this.state);
  }
}

export const profileStore = new ProfileStore();

// Same rule as the draft store: whenever the journey arrives at the login
// step, the previous user's data goes away (covers a 401 from any API call).
let previousStep = journey.get().step;
journey.subscribe((s) => {
  if (s.step === "AUTH" && previousStep !== "AUTH") profileStore.reset();
  previousStep = s.step;
});
