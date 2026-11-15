import { journey } from "../../state/journey";

/**
 * Module-level draft store for the shared UI components.
 *
 * app.ts rebuilds the whole view on every language / theme change, so
 * anything a user has typed lives only in the DOM and would be wiped. Fields
 * and review lists therefore mirror their value here and restore it when
 * they are built again with the same key.
 *
 * Drafts are dropped when the user arrives at the login step (logout or an
 * expired session) so the next person never sees the previous one's input.
 */

const store = new Map<string, unknown>();

export function draftGet<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function draftSet(key: string, value: unknown): void {
  store.set(key, value);
}

export function draftClear(key: string): void {
  store.delete(key);
}

export function draftClearPrefix(prefix: string): void {
  for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key);
}

// Clear only on the transition INTO the login step, not on every emission
// while the user is already typing there.
let previousStep = journey.get().step;
journey.subscribe((s) => {
  if (s.step === "AUTH" && previousStep !== "AUTH") store.clear();
  previousStep = s.step;
});
