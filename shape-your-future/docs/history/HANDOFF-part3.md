# Part 3 — Shared UI components (HANDOFF)

Seven reusable pieces, built once, in `frontend/src/lib/ui/`. Vanilla TS, same style as the rest of the app (`el()` builders, module-level state, `t()` at render time).

**Verified:** `tsc --noEmit` (strict) clean, `vite build` OK, 23 jsdom behaviour tests pass (`frontend/smoke/ui.test.ts`; I also broke the double-submit guard and the focus trap on purpose to confirm the tests fail).
**Not verified:** how it *looks*. I had no browser, so the CSS (skeleton shimmer, dialog, RTL mirroring) needs a visual pass in both themes and both languages.

## Files

New (copy as-is, paths mirror the repo):

| File | What |
|---|---|
| `lib/ui/async-panel.ts` | `asyncPanel` (loading skeleton / error+retry / empty / ready) |
| `lib/ui/review-and-confirm.ts` | `reviewAndConfirm` |
| `lib/ui/score-bar.ts`, `confidence-badge.ts` | `scoreBar` (0–100), `confidenceBadge` (0–1) |
| `lib/ui/confirm-dialog.ts` | `confirmDialog` |
| `lib/ui/form-field.ts` | `formField` |
| `lib/ui/empty-state-guide.ts` | `emptyStateGuide` |
| `lib/ui/submit-lock.ts` | `submitLock` |
| `lib/ui/drafts.ts` | internal draft store (fields + review edits survive a language switch; cleared on arrival at login) |
| `lib/ui/index.ts` | public entry: `import { … } from "../lib/ui"` |
| `lib/ui/i18n/en.ts`, `fa.ts` | copy, merged as `dict.ui` (same pattern as `growth-os/i18n`; `fa` is typed against `en`) |
| `styles/components.css` | all CSS, `ui-` prefixed, tokens only |

Existing files changed (also in `existing-files.patch`, ~100 lines):

- `styles/tokens.css` — appended section 4: `--color-scrim`, `--size-touch`, `--size-dialog-width`, `--motion-enter`, `--motion-shimmer`. Nothing existing touched.
- `main.ts` — one line: `import "./styles/components.css"` after `style.css`.
- `lib/dictionary.ts` — imports + `ui: uiEn/uiFa`, plus two new error strings `errors.llmUnavailable` and `errors.conflict` (en + fa).
- `lib/dom.ts` — `errorMessage()` now maps `llm_unavailable` and `conflict` to those strings. **This changes copy on existing screens**: `llm_unavailable` used to say the generic server text (the old comment in the file said a dedicated string was coming with the UI work), and `conflict` used to fall through to "generic".

**Placement:** the app already keeps DOM builders in `lib/` (`charts`, `header`, `page`, `step-indicator`), so components live in `lib/ui/` to avoid burying them among ten flat files. Moving them flat is a find/replace on import paths.

## Cross-cutting behaviour (why it's built this way)

`app.ts` rebuilds the whole view on every language change. Anything that lives only in the DOM is lost, so:

- **Text is translated when the component is built**, never stored. Errors are stored as `ApiError` / `kind`, not as strings.
- **User input is mirrored in `drafts.ts`** and restored by key (`formField` by `id`, `reviewAndConfirm` by `key`).
- **In-flight locks are keyed and module-level** (`submitLock`), so a rebuild mid-request re-binds the new buttons to the running request instead of re-enabling them.
- **`confirmDialog` is the exception** (it lives on `<body>`, outside the redraw), so it re-labels itself in place on a language switch.

## Usage

### 1. `asyncPanel`
```ts
panel.replaceChildren(asyncPanel({
  id: "dash-goals",
  status: s.status,                      // "idle" | "loading" | "ready" | "error"
  error: s.error ?? "unknown",           // ApiError or just an ApiErrorKind
  isEmpty: s.trees.length === 0,
  empty: {                               // required whenever isEmpty can be true
    title: d.rings.empty,
    nextStep: "Tell the mentor about a goal and it will build your roadmap.",
    action: { label: d.rings.emptyCta, onClick: () => journey.goTo("CHAT") },
  },
  onRetry: () => dashboardStore.load(),  // may return a promise; button stays locked until it settles
  skeleton: "list", rows: 3,             // "lines" | "card" | "list"
  render: () => buildGoalList(s),
}));
```
Error text comes from `errorMessage(err)` at render time. Retry is hidden for `kind: "auth"` (the session is gone; `handleAuthExpiry` already routes to login).

### 2. `reviewAndConfirm`
```ts
reviewAndConfirm<BrainDumpItem>({
  key: "brain-dump",
  items: state.proposal.items,           // keep this array reference stable (store state)
  itemLabel: (it) => it.item,
  renderItem: (it, ctx) =>
    formField({ id: ctx.fieldId("text"), label: "Item", value: it.item,
                onInput: (v) => ctx.update({ item: v }) }).node,
  confirmLabel: (n) => `Save ${n} items`,
  onConfirm: (items) => apiClient.confirmBrainDump({ log_date: today, items }).then(() => {}),
  onCancel: () => journey.goTo("CHAT"),
});
```
Shows "Nothing is saved until you confirm." Confirm/Cancel and every item control are disabled while submitting; a second click is ignored. A 429 shows "please wait" and re-enables; any other error shows a banner and **keeps the user's edits**. A new `items` array means a new proposal and a fresh draft. Confirm stays disabled if every item was removed (`minItems`, default 1).

### 3. `scoreBar`, `confidenceBadge`
```ts
scoreBar({ label: "Urgency", value: item.urgency });                 // 0..100
scoreBar({ label: "Mental load", value: item.mental_load, tone: "warn" });
confidenceBadge(item.confidence);                                     // 0..1 → "High · 82%"
```
Number/level is always written out (not colour-only). `scoreBar` is a `role="meter"` with localized `aria-valuetext`; tone is chosen by the caller because "high" is good for some scores and bad for others. Thresholds: `<0.4` low, `<0.7` medium, else high (`CONFIDENCE_THRESHOLDS`).

### 4. `confirmDialog`
```ts
// delete / archive
if (await confirmDialog({ kind: "delete", subject: goal.title,
      onConfirm: () => apiClient.<yourDeleteCall>(goal.id) })) { dashboardStore.load(); }

// logout (header.ts currently calls journey.reset() directly; wrap it like this)
logoutBtn.addEventListener("click", () =>
  void confirmDialog({ kind: "logout", onConfirm: async () => journey.reset() }));
```
`role="alertdialog"`, focus starts on Cancel, Tab/Shift+Tab trapped, `#app` made `inert`, Esc closes, focus returns to the opener (re-found via `data-focus-key` if a re-render replaced it, else `#view`). With `onConfirm` the dialog stays open while it runs (Esc ignored), shows the error and stays open on failure. Pass text as `() => t().…` if you override copy and want it to follow language switches. I did **not** edit `header.ts`; that wiring is yours to opt into.

### 5. `formField`
```ts
const title = formField({ id: "goal-title", label: d.what, hint: d.titleHint, required: true });
form.append(title.node);
// on submit
if (!title.getValue().trim()) { title.setError(d.needTitle); title.focus(); return; }
// after a successful save
clearFieldDraft("goal-title");
```
Label `for`, hint/error ids, `aria-describedby` (only lists what is visible), `aria-invalid`, `aria-required`. `control: "textarea" | "select"` supported. Reuses the existing `.field` / `.field-hint` styles. `id` must be stable across renders. Editing clears that field's own error.

### 6. `emptyStateGuide`
```ts
emptyStateGuide({ title: "No goals yet", description: "Goals appear here once you create one.",
                  nextStep: "Describe what you want to achieve in chat.",
                  action: { label: "Open chat", onClick: () => journey.goTo("CHAT") } });
// or { label, href } for a real URL. `action` is required by the type on purpose.
```

### 7. `submitLock`
```ts
const lock = submitLock("start-focus", {
  buttons: [btn], primary: btn, idleLabel: f.startFocus, busyLabel: f.starting,
  status: waitSlot,                       // gets the "please wait a moment" text on a 429
  onSettled: (r) => {                     // runs on the NEWEST binding, so it survives a re-render
    if (r.status === "error" && !handleAuthExpiry(r.error)) errorSlot.replaceChildren(errorBanner(errorMessage(r.error)));
  },
});
btn.addEventListener("click", () => void lock.run(() => apiClient.startFocus(id)));
```
Result is `ok | busy | rate_limited | error`. Cooldown is `RATE_LIMIT_COOLDOWN_MS` (3 s).

## Decisions and caveats

- **429 needs the error to propagate.** `ApiError` carries no `Retry-After`, so the cooldown is a fixed 3 s. Stores that swallow errors (e.g. `dashboardStore.load()`) can't trigger it; let the `ApiError` reach `lock.run`.
- **Rate-limit text reuses `errors.rateLimit`** ("Too many requests. Please wait a moment…") rather than adding a duplicate string.
- **Focus after a language switch:** field *values* survive, but keyboard focus does not (`app.ts` redraws `<main>`). Not fixed here; the Dashboard's `data-focus-key` + `keepFocus` pattern is the way if you want it.
- **`inert`** is used for the dialog's background; very old browsers fall back to the Tab trap alone.
- **`reviewAndConfirm`** needs `T extends object` and a stable `items` reference (or its edits reset on every redraw).
- **Persian copy is mine.** I matched the existing informal register ("…کن"), but have a native speaker skim `lib/ui/i18n/fa.ts` and the two new `errors.*` strings.
- **No views were migrated.** Adopting `asyncPanel` in Dashboard would replace its `loadingIndicator` / `errorBanner` / `primaryButton` blocks in `draw()`; I left that for the next part so this one stays reviewable.
- **Smoke tests are optional.** `frontend/smoke/ui.test.ts` sits outside `src/` (so `tsc -b` ignores it) and needs `npm i -D vitest@2 jsdom@25`; run `npx vitest run smoke`.
