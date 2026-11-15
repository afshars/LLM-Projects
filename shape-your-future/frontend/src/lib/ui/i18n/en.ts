/** English copy for the shared UI components in lib/ui. Merged into the app
 * dictionary as `dict.ui` (see lib/dictionary.ts). Error-kind copy is NOT
 * here: it stays in `dict.errors` and is rendered through errorMessage(). */
export const uiEn = {
  async: {
    loading: "Loading…",
    retry: "Try again",
    retrying: "Trying again…",
  },
  appError: {
    title: "Something went wrong",
    crashMessage: "This screen couldn't be displayed. Try again, or reload the page.",
    retry: "Try again",
    reload: "Reload the page",
    dismiss: "Dismiss",
  },
  empty: {
    nextStep: "Next step:",
    missingAction: "Nothing to show yet.",
  },
  review: {
    title: "Review before saving",
    notSaved: "Nothing is saved until you confirm.",
    notSavedHint: "Edit or remove anything that isn't right, then confirm.",
    itemsLabel: "Proposed items",
    remove: "Remove",
    removeAria: (label: string) => `Remove: ${label}`,
    removed: (label: string, left: string) => `Removed: ${label}. ${left} left.`,
    allRemoved: "You removed every item, so there is nothing to save. Discard to start over.",
    confirm: "Confirm and save",
    cancel: "Discard",
    saving: "Saving…",
  },
  confidence: {
    label: "Confidence",
    low: "Low",
    medium: "Medium",
    high: "High",
    unknown: "Unknown",
  },
  dialog: {
    cancel: "Cancel",
    working: "Working…",
    generic: {
      title: "Are you sure?",
      message: "Please confirm to continue.",
      confirm: "Confirm",
    },
    delete: {
      title: (subject?: string) => (subject ? `Delete “${subject}”?` : "Delete this item?"),
      message: "This can't be undone.",
      confirm: "Delete",
    },
    archive: {
      title: (subject?: string) => (subject ? `Archive “${subject}”?` : "Archive this item?"),
      message: "It will move out of your active list.",
      confirm: "Archive",
    },
    logout: {
      title: "Log out?",
      message: "You'll need to sign in again to continue.",
      confirm: "Log out",
    },
  },
};
