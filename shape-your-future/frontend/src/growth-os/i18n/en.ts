import type { RouteKey } from "../types";

/** English copy owned by the Growth OS feature. Merged into the app
 * dictionary as `dict.growth` (see lib/dictionary.ts). */
export const growthEn = {
  nav: {
    chat: "Coach",
    today: "Today",
    reflect: "Reflect",
    profile: "Profile & Settings",
  },
  shell: {
    primaryNav: "Main navigation",
    missing: {
      nextStep: "This page is not available. You can ask the Coach for one tactic.",
      cta: "Go to Coach",
    },
  },
  profile: {
    loading: "Loading your profile…",
    identity: {
      title: "Profile",
      username: "Username",
      displayName: "Display name",
      displayNameHint: "Up to 50 characters. Leave it empty to show your username.",
      save: "Save profile",
      saving: "Saving…",
      saved: "Profile saved.",
      nameTooLong: "The display name can be at most 50 characters.",
    },
    preferences: {
      title: "Preferences",
      language: "Language",
      theme: "Theme",
      themeLight: "Light",
      themeDark: "Dark",
    },
    password: {
      title: "Change password",
      current: "Current password",
      new: "New password",
      confirm: "Confirm new password",
      submit: "Change password",
      submitting: "Changing…",
      changed: "Password changed. You stay signed in on this device.",
      wrongCurrent: "The current password is incorrect.",
    },
    session: {
      title: "Session",
      hint: "Log out of this device.",
      logout: "Log out",
    },
  },
  routes: {
    reflect: { label: "Reflect" },
    account: { label: "Account" },
  } as Record<RouteKey, { label: string }>,
  chat: {
    heading: "Chat with your AI mentor",
    placeholder: "Tell me what's on your mind…",
    send: "Send",
    greeting:
      "Hi, I’m your AI mentor for building a better future. Share whatever is on your mind, and together we’ll turn it into clear, doable next steps.",
    quickStarters: [
      "My mind feels really cluttered",
      "I want to emigrate for a PhD",
      "I don't know where to start",
    ] as string[],
    quickStartersLabel: "Conversation starters",
    feedLabel: "Conversation with your AI mentor",
    inputLabel: "Your message",
    typing: "The mentor is typing…",
    senderUser: "You",
    senderMentor: "AI mentor",
    senderSystem: "Notice",
    // Restoring a conversation after the page was reloaded or an earlier one was opened.
    restoring: "Reconnecting to your conversation…",
    restoreRetry: "Try again",
    restoreStartNew: "Start a new conversation",
    // Chat history: the toolbar buttons and the list of earlier conversations.
    history: {
      toolbarLabel: "Conversations",
      historyButton: "History",
      newChat: "New chat",
      panelTitle: "Your conversations",
      loading: "Loading your conversations…",
      empty: "No earlier conversations yet. They appear here once you start chatting.",
      retry: "Try again",
      current: "Current",
      messageCount: (n: string) => `${n} messages`,
      openLabel: (title: string) => `Open conversation: ${title}`,
    },
  },
  coach: {
    heading: "Coach: Highlight, tactic and chat",
    // The two parts of the Coach screen (landmark names): Highlight + tactic on one side, the AI chat on the other.
    layout: {
      hideSide: "Hide side panel",
      showSide: "Show side panel",
      hideMenu: "Hide menu",
      showMenu: "Show menu",
    },
    sideLabel: "Your Highlight and tactic",
    chatLabel: "Chat with your AI mentor",
    highlight: {
      title: "Today's Highlight",
      none: "You haven't set today's Highlight yet.",
      set: "Set my Highlight",
      done: "Done",
      pending: "Not done yet",
      loading: "Loading…",
      at: (time: string) => `Planned for ${time}`,
    },
    tactic: {
      title: "One tactic for today",
      question: "What is getting in the way of your Highlight today?",
      suggest: "Suggest one tactic",
      thinking: "Thinking…",
      proposal: "Suggested for you. Nothing is saved until you say yes.",
      notSavedYet: "This is only a suggestion. It is saved only if you use it.",
      confirm: "Use this tactic",
      saving: "Saving…",
      dismiss: "Not this one",
      saved: "Saved as today's tactic.",
      another: "Pick a different tactic",
      needsMore: "I could not tell what the obstacle is. Say a bit more, in one or two sentences.",
      blockers: {
        busy: "Too much to do",
        distracted: "Distraction",
        energy: "Low energy",
        external: "Something outside your control",
        internal: "Hesitation or indecision",
      } as Record<string, string>,
    },
  },
};
