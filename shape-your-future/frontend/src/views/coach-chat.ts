import { apiClient } from "../api/client";
import { CHAT_MESSAGE_MAX_LENGTH } from "../api/types";
import type { ChatMessage } from "../api/types";
import { handleAuthExpiry } from "../lib/auth-guard";
import { el, errorMessage, isApiError } from "../lib/dom";
import { LANG_META } from "../lib/locales";
import { loadConversationHistory } from "../state/conversation-history";
import { restoreConversation, shouldRestoreOnMount } from "../state/conversation-restore";
import { journey } from "../state/journey";
import { localDay } from "../state/today";
import type { ViewContext } from "./view-context";

/**
 * The AI chat: the right-hand pane of the Coach screen (views/coach.ts). Markup contract: style.css / styles/chat.css
 * ("AI Chat"): .chat-view > .chat-toolbar + .chat-history + .chat-body (.chat-feed + .chat-dock).
 *
 * All conversation state lives in `journey.get().conversation`, so it survives the full re-render app.ts does on
 * language/theme change. This view only renders it and calls journey actions; it keeps no copy of it. The welcome
 * message is rendered from the dictionary (not stored), so it flips language with the rest of the UI.
 *
 * The chat is a plain conversation: no plan, no goal, no stage. It never changes today's entry.
 */

const MAX_COMPOSER_HEIGHT = 160; // px, then the textarea scrolls

let idCounter = 0;
const nextId = (): string => `msg-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/** Unsubscribes the previously mounted view (app.ts re-renders from scratch). */
let disposeActive: (() => void) | null = null;

/** True while the chat is on screen. app.ts calls renderCoachChat again on every language/theme change and state
 * emission; only the call after disposeCoachChat() is a real (re)mount, and only a real mount may restore the
 * conversation. */
let chatMounted = false;

/** Called by app.ts when the journey leaves the Coach screen, so no listener (and no detached DOM) outlives the view. */
export function disposeCoachChat(): void {
  disposeActive?.();
  disposeActive = null;
  chatMounted = false;
}

const SEND_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';

export function renderCoachChat(container: HTMLElement, context: ViewContext): void {
  disposeActive?.();
  const freshMount = !chatMounted; // false on a language/theme re-render: no restore, no refetch
  chatMounted = true;

  const c = context.dict.growth.chat;
  const locale = LANG_META[context.lang].locale;
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const numFormat = new Intl.NumberFormat(locale); // digits follow the UI language (Persian digits in fa)

  // ---------- Static skeleton ----------
  // aria-live starts "off" and is switched to "polite" once the history is painted (end of this function): otherwise
  // every language switch would re-announce the whole conversation.
  const feed = el("div", { class: "chat-feed", role: "log", "aria-live": "off", "aria-label": c.feedLabel });
  const anchor = el("div", { class: "chat-feed__anchor", "aria-hidden": "true" });

  const typing = el("div", { class: "chat-typing", role: "status" }, [
    el("span", { class: "chat-typing__dot" }),
    el("span", { class: "chat-typing__dot" }),
    el("span", { class: "chat-typing__dot" }),
    el("span", { class: "sr-only" }, [c.typing]),
  ]);

  const chipsBox = el("div", { class: "chat-suggestions", role: "group", "aria-label": c.quickStartersLabel });
  const chips: HTMLButtonElement[] = c.quickStarters.map((text) => {
    const chip = el("button", { class: "chat-suggestions__chip", type: "button" }, [text]) as HTMLButtonElement;
    chip.addEventListener("click", () => void send(text));
    chipsBox.append(chip);
    return chip;
  });

  const input = el("textarea", {
    class: "chat-composer__input",
    rows: "1",
    placeholder: c.placeholder,
    "aria-label": c.inputLabel,
    maxlength: String(CHAT_MESSAGE_MAX_LENGTH),
    enterkeyhint: "send",
    dir: "auto",
  }) as HTMLTextAreaElement;

  const sendBtn = el("button", { class: "chat-composer__send", type: "button", "aria-label": c.send, title: c.send }) as HTMLButtonElement;
  sendBtn.innerHTML = SEND_ICON;

  const composer = el("div", { class: "chat-composer" }, [input, sendBtn]);
  const dock = el("div", { class: "chat-dock" }, [chipsBox, composer]);
  feed.append(anchor); // scroll sentinel: always the last child, everything else is inserted before it
  const body = el("div", { class: "chat-body" }, [feed, dock]);

  // ---------- History toolbar + panel ----------
  const h = c.history;
  const PANEL_ID = "chat-history-panel";
  const historyBtn = el("button", {
    class: "btn-secondary chat-toolbar__btn",
    type: "button",
    "aria-controls": PANEL_ID,
    "aria-expanded": "false",
  }, [h.historyButton]) as HTMLButtonElement;
  const newChatBtn = el("button", { class: "btn-secondary chat-toolbar__btn", type: "button" }, [h.newChat]) as HTMLButtonElement;
  const toolbar = el("div", { class: "chat-toolbar", role: "group", "aria-label": h.toolbarLabel }, [historyBtn, newChatBtn]);
  const historyPanel = el("section", { class: "chat-history", id: PANEL_ID, "aria-label": h.panelTitle }) as HTMLElement;
  historyPanel.hidden = true;
  const historyDate = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  // The pane's own heading (the Coach screen has the page's h1); visible to screen readers only.
  const view = el("div", { class: "chat-view" }, [el("h2", { class: "sr-only" }, [c.heading]), toolbar, historyPanel, body]);

  container.replaceChildren(view);

  // ---------- Rendering ----------
  const rendered = new Map<string, HTMLElement>();
  let greetingNode: HTMLElement | null = null;
  let noticeNode: HTMLElement | null = null;
  let restoreNode: HTMLElement | null = null;
  let firstPaint = true;
  let wasRestoring = false;

  function messageNode(role: "assistant" | "user" | "system", text: string, timestamp?: string, animate = true): HTMLElement {
    const bubble = el("div", { class: "chat-message__bubble", dir: "auto" }, [text]); // textContent only: never HTML
    // Sender is otherwise conveyed by colour/side only. Kept OUTSIDE the bubble so it can't influence the bubble's
    // dir="auto" detection.
    const sender = role === "user" ? c.senderUser : role === "system" ? c.senderSystem : c.senderMentor;
    const node = el("div", { class: `chat-message chat-message--${role}` }, [el("span", { class: "sr-only" }, [`${sender}: `]), bubble]);
    const when = timestamp ? new Date(timestamp) : null;
    if (when && !Number.isNaN(when.getTime())) node.append(el("div", { class: "chat-message__meta" }, [timeFormat.format(when)]));
    if (!animate) node.style.animation = "none"; // history redrawn after a language switch must not replay the entrance
    return node;
  }

  function scrollToEnd(smooth: boolean) {
    // Element.scrollTo is missing in some old browsers and in jsdom: fall back to setting the offset.
    if (typeof feed.scrollTo === "function") feed.scrollTo({ top: feed.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    else feed.scrollTop = feed.scrollHeight;
  }

  function autosize() {
    input.style.blockSize = "auto";
    input.style.blockSize = `${Math.min(input.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  }

  /** A backend request that must block sending is in flight. */
  function busy(): boolean {
    const conv = journey.get().conversation;
    return conv.awaiting || conv.restoreStatus === "restoring";
  }

  /** Restore progress / failure. The error text is built here from the stored ApiError kind, so it is in the current
   * UI language after a language switch. 404 -> start over; other errors -> retry. */
  function buildRestoreNode(): HTMLElement | null {
    const conv = journey.get().conversation;
    if (conv.restoreStatus === "restoring") {
      return el("div", { class: "chat-restore", role: "status" }, [el("p", { class: "chat-restore__text" }, [c.restoring])]);
    }
    if (conv.restoreStatus !== "error") return null;
    const kind = conv.restoreErrorKind ?? "unknown";
    const text = errorMessage({ kind, status: null, message: "" }, "conversation-restore");
    const notFound = kind === "not_found";
    const btn = el("button", { class: notFound ? "btn-primary" : "btn-secondary", type: "button" }, [
      notFound ? c.restoreStartNew : c.restoreRetry,
    ]) as HTMLButtonElement;
    btn.addEventListener("click", () => {
      if (notFound) {
        journey.startNewConversation();
        input.focus();
      } else {
        const id = journey.get().conversation.conversationId;
        if (id) void restoreConversation(id);
      }
    });
    return el("div", { class: "chat-restore chat-restore--error", role: "alert" }, [el("p", { class: "chat-restore__text" }, [text]), btn]);
  }

  /** The list of earlier conversations inside the panel. Rebuilt only when what it shows changes. */
  let historySig = "";
  function syncHistory() {
    const conv = journey.get().conversation;
    const hist = conv.history;
    const blocked = busy();
    historyBtn.setAttribute("aria-expanded", String(hist.open));
    historyBtn.classList.toggle("is-active", hist.open);
    historyPanel.hidden = !hist.open;
    // New chat does nothing when this one is already empty and unsaved.
    newChatBtn.disabled = blocked || (conv.conversationId === null && conv.messages.length === 0);
    if (!hist.open) {
      historySig = "";
      return;
    }
    const sig = JSON.stringify([hist.status, hist.errorKind, hist.items.map((i) => [i.conversation_id, i.updated_at, i.title]), conv.conversationId, blocked]);
    if (sig === historySig) return;
    historySig = sig;

    const title = el("h3", { class: "chat-history__title" }, [h.panelTitle]);
    const parts: HTMLElement[] = [title];
    if (hist.status === "error" && hist.items.length === 0) {
      const retry = el("button", { class: "btn-secondary", type: "button" }, [h.retry]) as HTMLButtonElement;
      retry.addEventListener("click", () => void loadConversationHistory());
      parts.push(
        el("div", { class: "chat-history__state chat-history__state--error", role: "alert" }, [
          el("p", { class: "chat-history__text" }, [errorMessage({ kind: hist.errorKind ?? "unknown", status: null, message: "" })]),
          retry,
        ])
      );
    } else if (hist.items.length === 0) {
      const loading = hist.status === "loading" || hist.status === "idle";
      parts.push(el("p", { class: "chat-history__state", ...(loading ? { role: "status" } : {}) }, [loading ? h.loading : h.empty]));
    } else {
      const list = el("ul", { class: "chat-history__list" });
      for (const item of hist.items) {
        const isCurrent = item.conversation_id === conv.conversationId;
        const btn = el("button", {
          class: `chat-history__item${isCurrent ? " is-current" : ""}`,
          type: "button",
          "aria-label": h.openLabel(item.title),
          ...(isCurrent ? { "aria-current": "true" } : {}),
        }, [
          el("span", { class: "chat-history__item-title", dir: "auto" }, [item.title]),
          el("span", { class: "chat-history__item-meta" }, [
            isCurrent ? h.current : historyDate.format(new Date(item.updated_at)),
            " · ",
            h.messageCount(numFormat.format(item.message_count)),
          ]),
        ]) as HTMLButtonElement;
        btn.disabled = blocked;
        btn.addEventListener("click", () => openEarlier(item.conversation_id));
        list.append(el("li", {}, [btn]));
      }
      parts.push(list);
    }
    historyPanel.replaceChildren(...parts);
  }

  function sync(focusInput = false) {
    if (!view.isConnected) return; // this view was replaced by a newer render
    const conv = journey.get().conversation;
    const animate = !firstPaint;

    // A restored history arrives in one go: keep the log silent while it is painted, so a screen reader does not read
    // the whole conversation out. New messages are announced again right after.
    if (conv.restoreStatus === "restoring") wasRestoring = true;
    else if (wasRestoring) {
      wasRestoring = false;
      feed.setAttribute("aria-live", "off");
      window.setTimeout(() => {
        if (view.isConnected) feed.setAttribute("aria-live", "polite");
      }, 300);
    }

    // Composer text: restores a failed message, or the draft after a re-render.
    if (input.value !== conv.draft) {
      input.value = conv.draft;
      autosize();
    }

    // Messages
    if (!greetingNode) {
      greetingNode = messageNode("assistant", c.greeting, undefined, animate);
      feed.insertBefore(greetingNode, anchor);
    }
    const liveIds = new Set(conv.messages.map((m) => m.id));
    for (const [id, node] of rendered) {
      if (!liveIds.has(id)) {
        node.remove();
        rendered.delete(id);
      }
    }
    for (const msg of conv.messages) {
      const existing = rendered.get(msg.id);
      if (!existing) {
        const role = msg.role === "user" ? "user" : msg.role === "system" ? "system" : "assistant";
        const node = messageNode(role, msg.content, msg.timestamp, animate);
        node.classList.toggle("chat-message--pending", msg.status === "pending");
        rendered.set(msg.id, node);
        feed.insertBefore(node, anchor);
      } else {
        existing.classList.toggle("chat-message--pending", msg.status === "pending");
      }
    }

    // Restore progress / failure (state/conversation-restore.ts)
    restoreNode?.remove();
    restoreNode = buildRestoreNode();
    if (restoreNode) feed.insertBefore(restoreNode, anchor);

    // Quiet system notice (request errors)
    noticeNode?.remove();
    noticeNode = null;
    if (conv.notice) {
      noticeNode = messageNode("system", conv.notice, undefined, true);
      noticeNode.setAttribute("role", "alert");
      feed.insertBefore(noticeNode, anchor);
    }

    // Typing indicator
    if (conv.awaiting) feed.insertBefore(typing, anchor);
    else typing.remove();

    syncHistory();

    // Controls
    const blocked = busy();
    sendBtn.disabled = blocked || input.value.trim().length === 0;
    sendBtn.setAttribute("aria-busy", String(blocked));
    input.setAttribute("aria-busy", String(blocked));
    for (const chip of chips) chip.disabled = blocked;
    // starters only help on a new, empty conversation
    chipsBox.hidden = conv.messages.length > 0;

    scrollToEnd(!firstPaint);
    if (focusInput) input.focus();
  }

  // ---------- Actions ----------
  async function send(raw: string): Promise<void> {
    const text = raw.trim().slice(0, CHAT_MESSAGE_MAX_LENGTH);
    if (!text || busy()) return;

    const message: ChatMessage = { id: nextId(), role: "user", content: text, timestamp: new Date().toISOString(), status: "pending" };
    input.value = "";
    autosize();
    journey.setDraft("");
    journey.setConversationNotice(null);
    journey.appendMessage(message);
    journey.setAwaiting(true);

    try {
      // The backend needs a conversation id: create it lazily on the first send.
      if (!journey.get().conversation.conversationId) {
        journey.recordTurn(await apiClient.startConversation(context.lang));
      }
      const id = journey.get().conversation.conversationId as string;
      const turn = await apiClient.continueConversation(id, text, context.lang, localDay());
      journey.updateMessage(message.id, { status: "sent" });
      journey.recordTurn(turn);
      if (turn.question_fa) {
        journey.appendMessage({
          id: nextId(),
          role: "assistant",
          content: turn.question_fa,
          timestamp: new Date().toISOString(),
          status: "sent",
        });
      }
    } catch (err) {
      if (handleAuthExpiry(err)) return; // journey.reset() wiped everything and routed to Auth
      // Drop the optimistic bubble; hand the text back for an easy resend unless the user already typed more.
      journey.removeMessage(message.id);
      if (!journey.get().conversation.draft) journey.setDraft(text);
      // Unknown/expired conversation: the next send starts a fresh one.
      if (isApiError(err) && err.kind === "not_found") journey.setConversationId(null);
      journey.setConversationNotice(errorMessage(err));
    } finally {
      // After a 401 the conversation was reset; awaiting is already false.
      if (journey.get().conversation.awaiting) journey.setAwaiting(false);
      if (journey.get().conversation.history.open) void loadConversationHistory(); // a new chat just appeared / moved up
      sync(true);
    }
  }

  function toggleHistory() {
    const open = !journey.get().conversation.history.open;
    journey.setHistoryOpen(open);
    if (open) void loadConversationHistory(); // fresh list every time the panel opens
  }

  function openEarlier(id: string) {
    if (busy()) return;
    if (id === journey.get().conversation.conversationId) {
      journey.setHistoryOpen(false); // already here: just close the panel
      return;
    }
    journey.openConversation(id); // clears the feed, closes the panel, keeps the unsent draft
    void restoreConversation(id); // fills the feed from GET /conversation/{id}
    input.focus(); // user-initiated
  }

  function newChat() {
    if (busy()) return;
    journey.startNewConversation();
    input.focus(); // user-initiated
  }

  // ---------- Events ----------
  historyBtn.addEventListener("click", toggleHistory);
  newChatBtn.addEventListener("click", newChat);

  input.addEventListener("input", () => {
    journey.setDraft(input.value); // silent: no re-render while typing
    autosize();
    sendBtn.disabled = busy() || input.value.trim().length === 0;
  });

  input.addEventListener("keydown", (e) => {
    // Enter sends, Shift+Enter inserts a newline. Ignore Enter while an IME composition is being confirmed (e.g.
    // Persian/CJK candidate selection).
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void send(input.value);
    }
  });

  sendBtn.addEventListener("click", () => void send(input.value));

  // ---------- Mount ----------
  const unsubscribe = journey.subscribeConversation(() => sync());
  disposeActive = unsubscribe;
  // Only a real (re)mount may restore: id in the store, no messages yet. Never on a language change.
  const mountedConv = journey.get().conversation;
  if (freshMount && mountedConv.conversationId && shouldRestoreOnMount(mountedConv)) {
    void restoreConversation(mountedConv.conversationId);
  }
  sync();
  firstPaint = false;
  window.setTimeout(() => {
    if (view.isConnected) feed.setAttribute("aria-live", "polite");
  }, 300);
}
