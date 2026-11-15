import { apiClient } from "../api/client";
import { handleAuthExpiry } from "../lib/auth-guard";
import { isApiError } from "../lib/dom";
import { journey } from "./journey";

/**
 * The chat history list: GET /conversation, stored in `journey.get().conversation.history`.
 *
 * Never throws. A failure is stored as the ApiError `kind` only and translated at render time (errorMessage), so it
 * follows a language switch. A 401 resets the journey (handleAuthExpiry). Calls made while one is running share
 * that request. The rows already on screen stay while a refresh runs.
 */

let inflight: Promise<void> | null = null;

export function loadConversationHistory(): Promise<void> {
  if (inflight) return inflight;
  inflight = run().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function run(): Promise<void> {
  journey.beginHistoryLoad();
  try {
    const res = await apiClient.listConversations();
    journey.completeHistoryLoad(res.items);
  } catch (err) {
    if (handleAuthExpiry(err)) return;
    journey.failHistoryLoad(isApiError(err) ? err.kind : "unknown");
  }
}
