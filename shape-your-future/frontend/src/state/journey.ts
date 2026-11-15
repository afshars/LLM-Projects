import { authStorage } from "../api/auth-storage";
import type { ApiErrorKind, ChatMessage, ConversationSummary, ConversationTurnResponse } from "../api/types";
import { reportAppError } from "../lib/app-error";
import { FALLBACK_STEP, isNavigableRoute, isNavigableStep } from "../growth-os/nav";
import { conversationStorage } from "./conversation-storage";

/**
 * Deliberately simple, explicit journey state (Phase 5). No library -
 * a plain object plus a subscriber list. The UI layer reads
 * `state.step` to decide what to render, so it cannot accidentally show
 * the Daily Plan before earlier steps are satisfied.
 */
export type Step =
  | "AUTH"
  | "COACH"
  | "DASHBOARD"
  | "CONTEXT_SETUP"
  | "GOAL_CREATION"
  | "DECOMPOSITION"
  | "GOAL_WORKSPACE"
  | "PLANNING_REQUIRED"
  | "DAILY_PLAN"
  /** Placeholder / sub-route screens of the navigation shell; which one is
   * in `JourneyState.sectionRoute` (ids come from growth-os/registry.ts). */
  | "SECTION_VIEW";

/** Status of GET /conversation/{id} (state/conversation-restore.ts). */
export type RestoreStatus = "idle" | "restoring" | "error";

/** The chat history list (GET /conversation) and whether its panel is open. Lives inside the conversation state so
 * logout / 401 wipes it with everything else, and a language switch keeps it (no refetch). */
export interface ConversationHistoryState {
  open: boolean;
  status: "idle" | "loading" | "ready" | "error";
  items: ConversationSummary[];
  errorKind: ApiErrorKind | null;
}

function emptyHistory(): ConversationHistoryState {
  return { open: false, status: "idle", items: [], errorKind: null };
}

/** State of the AI chat (views/coach-chat.ts). Lives here, not in the view, so it survives the full re-render app.ts
 * does on every language or theme change, and so logout wipes it together with the rest. */
export interface ConversationState {
  /** Null until POST /conversation/start has succeeded. */
  conversationId: string | null;
  /** The messages on screen. The welcome message is NOT stored here: it is rendered from the dictionary, so it flips
   * language with the UI. */
  messages: ChatMessage[];
  /** GET /conversation/{id} request state. The error is stored as the ApiError `kind` only and translated at render
   * time (errorMessage), so it follows a language switch. */
  restoreStatus: RestoreStatus;
  restoreErrorKind: ApiErrorKind | null;
  /** True once a restore for the current id succeeded: it stops the restore from re-running on every later mount. */
  restored: boolean;
  /** A start/continue request is in flight. */
  awaiting: boolean;
  /** Unsent composer text (kept across re-renders). */
  draft: string;
  /** Last request error, shown as a quiet system notice. */
  notice: string | null;
  /** The history list of earlier conversations (state/conversation-history.ts fills it). */
  history: ConversationHistoryState;
}

export interface JourneyState {
  step: Step;
  conversation: ConversationState;
  /** Route id while `step === "SECTION_VIEW"`, e.g. "reflect/evening". */
  sectionRoute: string | null;
}

type Listener = (state: JourneyState) => void;

function emptyConversation(): ConversationState {
  return {
    conversationId: null,
    messages: [],
    restoreStatus: "idle",
    restoreErrorKind: null,
    restored: false,
    awaiting: false,
    draft: "",
    notice: null,
    history: emptyHistory(),
  };
}

/** Signed-in users land on Coach; everyone else on Auth. */
function initialStep(): Step {
  return authStorage.isAuthenticated() ? "COACH" : "AUTH";
}

class JourneyStore {
  private state: JourneyState = {
    step: initialStep(),
    // A signed-in user who reloads the page keeps their conversation id: the chat restores it from the backend.
    conversation: { ...emptyConversation(), conversationId: authStorage.isAuthenticated() ? conversationStorage.get() : null },
    sectionRoute: null,
  };
  private listeners: Listener[] = [];
  /** Separate channel for conversation-only changes: app.ts re-draws the whole view on every `subscribe` emission,
   * which would wipe the composer focus on each message. Only the mounted chat listens here. */
  private conversationListeners: Listener[] = [];

  get(): JourneyState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  subscribeConversation(listener: Listener): () => void {
    this.conversationListeners.push(listener);
    return () => {
      this.conversationListeners = this.conversationListeners.filter((l) => l !== listener);
    };
  }

  /** Mirrors the conversation id into storage (set when there is one, cleared when not), so every path that drops the
   * id - logout, 401, "start a new conversation" - also forgets it for the next reload. */
  private persistConversationId() {
    const id = this.state.conversation.conversationId;
    if (id) conversationStorage.set(id);
    else conversationStorage.clear();
  }

  private emitConversation() {
    this.persistConversationId();
    for (const listener of [...this.conversationListeners]) {
      try {
        listener(this.state);
      } catch (error) {
        reportAppError(error, "listener");
      }
    }
  }

  private patchConversation(patch: Partial<ConversationState>, notify = true) {
    this.state = { ...this.state, conversation: { ...this.state.conversation, ...patch } };
    if (notify) this.emitConversation();
  }

  private emit() {
    this.persistConversationId();
    // One failing listener (a view that throws while re-drawing) must not stop the others from running.
    for (const listener of [...this.listeners]) {
      try {
        listener(this.state);
      } catch (error) {
        reportAppError(error, "listener");
      }
    }
  }

  // ---------------- Conversation actions ----------------

  setConversationId(conversationId: string | null) {
    // Dropping the id (unknown conversation) also drops any restore state tied to it.
    this.patchConversation(
      conversationId === null ? { conversationId, restoreStatus: "idle", restoreErrorKind: null, restored: false } : { conversationId }
    );
  }

  appendMessage(message: ChatMessage) {
    this.patchConversation({ messages: [...this.state.conversation.messages, message] });
  }

  updateMessage(id: string, patch: Partial<Omit<ChatMessage, "id">>) {
    this.patchConversation({
      messages: this.state.conversation.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
  }

  removeMessage(id: string) {
    this.patchConversation({ messages: this.state.conversation.messages.filter((m) => m.id !== id) });
  }

  /** Records the id of a backend turn (start/continue). A successful turn proves the conversation exists: a stale
   * restore error no longer applies. */
  recordTurn(turn: ConversationTurnResponse) {
    const clearRestoreError =
      this.state.conversation.restoreStatus === "error" ? ({ restoreStatus: "idle", restoreErrorKind: null } as const) : {};
    this.patchConversation({ conversationId: turn.conversation_id, ...clearRestoreError });
  }

  // ---------------- Restore (state/conversation-restore.ts) ----------------

  beginRestore() {
    this.patchConversation({ restoreStatus: "restoring", restoreErrorKind: null });
  }

  /** GET /conversation/{id} succeeded. When it returned messages and the view has none yet (a reload, or a thread
   * opened from the history list), they are rebuilt. Messages already on screen are never replaced; the draft is kept. */
  completeRestore(turn: ConversationTurnResponse) {
    const history = turn.messages ?? [];
    const hydrate = history.length > 0 && this.state.conversation.messages.length === 0;
    const messages: ChatMessage[] = history.map((m, i) => ({
      id: `restored-${i}`,
      role: m.role,
      content: m.content,
      timestamp: m.at ?? "",
      status: "sent",
    }));
    this.patchConversation({
      ...(hydrate ? { messages } : {}),
      restoreStatus: "idle",
      restoreErrorKind: null,
      restored: true,
    });
  }

  failRestore(kind: ApiErrorKind) {
    this.patchConversation({ restoreStatus: "error", restoreErrorKind: kind });
  }

  /** "Start a new conversation": drops the old id and the messages. The unsent draft and the list are kept. The next
   * send creates a fresh conversation. */
  startNewConversation() {
    const { draft, history } = this.state.conversation;
    this.state = { ...this.state, conversation: { ...emptyConversation(), draft, history: { ...history, open: false } } };
    this.emitConversation();
  }

  /** Opens an EARLIER conversation from the history list: same reset as a new conversation, but with that id set. The
   * caller then runs restoreConversation(id), which fills the messages. */
  openConversation(id: string) {
    const { draft, history } = this.state.conversation;
    this.state = {
      ...this.state,
      conversation: { ...emptyConversation(), conversationId: id, draft, history: { ...history, open: false } },
    };
    this.emitConversation();
  }

  // ---------------- History list (state/conversation-history.ts) ----------------

  private patchHistory(patch: Partial<ConversationHistoryState>) {
    this.patchConversation({ history: { ...this.state.conversation.history, ...patch } });
  }

  setHistoryOpen(open: boolean) {
    this.patchHistory({ open });
  }

  /** Keeps the rows already shown while a refresh runs (no flash of "loading"). */
  beginHistoryLoad() {
    this.patchHistory({ status: "loading", errorKind: null });
  }

  completeHistoryLoad(items: ConversationSummary[]) {
    this.patchHistory({ status: "ready", items, errorKind: null });
  }

  failHistoryLoad(kind: ApiErrorKind) {
    this.patchHistory({ status: "error", errorKind: kind });
  }

  setAwaiting(awaiting: boolean) {
    this.patchConversation({ awaiting });
  }

  /** Silent (no emit): called on every keystroke, the textarea already shows it. */
  setDraft(draft: string) {
    this.patchConversation({ draft }, false);
  }

  setConversationNotice(notice: string | null) {
    this.patchConversation({ notice });
  }

  /** A step that is no longer in the product (Dashboard, Goals, Feedback, ...) opens Today instead: nothing can
   * route a user to a screen that app.ts no longer draws. */
  goTo(step: Step) {
    this.state = { ...this.state, step: isNavigableStep(step) ? step : FALLBACK_STEP };
    this.emit();
  }

  /** Navigation shell: open a sub-route screen (see growth-os/registry.ts). */
  goToRoute(routeId: string) {
    // A retired or unknown route id opens Today (never a blank section).
    if (!isNavigableRoute(routeId)) {
      this.state = { ...this.state, step: FALLBACK_STEP, sectionRoute: null };
      this.emit();
      return;
    }
    this.state = { ...this.state, step: "SECTION_VIEW", sectionRoute: routeId };
    this.emit();
  }

  /** Called on logout or a 401 from any API call. */
  reset() {
    authStorage.clearToken();
    this.state = {
      step: "AUTH",
      conversation: emptyConversation(),
      sectionRoute: null,
    };
    this.emit();
  }
}

export const journey = new JourneyStore();
