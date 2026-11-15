import { apiClient } from "../api/client";
import { handleAuthExpiry } from "../lib/auth-guard";
import { isApiError } from "../lib/dom";
import { journey } from "./journey";
import type { ConversationState } from "./journey";

/**
 * Restoring a conversation from GET /conversation/{id}: after a page reload (the id is kept in localStorage, see
 * state/conversation-storage.ts) and when a thread is opened from the history list. The backend returns the stored
 * transcript, so the messages are rebuilt (state/journey.ts completeRestore).
 */

const inflight = new Map<string, Promise<void>>();

/** True when a freshly mounted chat should call restoreConversation: the store has an id but no messages, and nothing
 * has been tried or done for it yet. Never true after a successful restore, while one is running, or after a failed
 * one (the user retries or starts over with the buttons). */
export function shouldRestoreOnMount(conversation: ConversationState): boolean {
  return (
    conversation.conversationId !== null &&
    conversation.messages.length === 0 &&
    conversation.restoreStatus === "idle" &&
    !conversation.restored &&
    !conversation.awaiting
  );
}

/** GET /conversation/{id}, then update the conversation state. Never throws; a failure is stored as
 * `restoreStatus: "error"` + the ApiError kind. A second call for the same id while one is running shares that
 * request. A 401 resets the journey (handleAuthExpiry). A result for an id that is no longer the current one (logout,
 * "new chat") is dropped. */
export function restoreConversation(id: string): Promise<void> {
  const running = inflight.get(id);
  if (running) return running;
  const promise = run(id).finally(() => inflight.delete(id));
  inflight.set(id, promise);
  return promise;
}

async function run(id: string): Promise<void> {
  journey.beginRestore();
  try {
    const turn = await apiClient.getConversation(id);
    if (journey.get().conversation.conversationId !== id) return;
    journey.completeRestore(turn);
  } catch (err) {
    if (handleAuthExpiry(err)) return;
    if (journey.get().conversation.conversationId !== id) return;
    journey.failRestore(isApiError(err) ? err.kind : "unknown");
  }
}
