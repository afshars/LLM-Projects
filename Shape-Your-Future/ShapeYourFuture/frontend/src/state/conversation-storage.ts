/**
 * Where the current conversation id lives across a page reload, so the chat can be restored from
 * GET /conversation/{id} (transcript + latest plan). Same idea as api/auth-storage.ts: nothing else
 * touches localStorage for this. Only the opaque id is stored (never messages or plans); it is cleared
 * on logout / 401 (journey.reset), when a new conversation is started, and when the goal flow takes over.
 * Every access is guarded: storage can be unavailable (private mode) and the chat must still work.
 */
const KEY = "maketime_conversation_id";

export const conversationStorage = {
  get(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(id: string): void {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* storage unavailable: the chat just won't survive a reload */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};
