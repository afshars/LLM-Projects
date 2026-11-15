# HANDOFF part 12b: Plan interview, chat-like UI (route `plan/interview`)

**Not run:** no `node_modules` / network here. Verified: `tsc --noEmit -p .` clean (the only errors are the CSS / font side-effect imports in `main.ts`, which need vite's types) and `check-i18n-parity` OK (806 / 806). Please run `tsc --noEmit` and `vitest run`. Not seen in a browser: layout, RTL, focus ring.

## Files
- NEW `src/views/plan-interview.ts`: `renderPlanInterviewPage(): HTMLElement`, render-only. Registered in `views/section-view.ts` (`"plan/interview"`).
- NEW `src/state/plan-interview-flow.ts` (the only place that calls `apiClient.planInterview`; the 12a slice file is unchanged):
  - `sendInterviewTurn(text): Promise<"ok" | "skipped">`, `retryInterviewTurn(): Promise<"ok" | "skipped">` (both REJECT with the ApiError after updating the slice, so `submitLock` can see a 429)
  - `hasRetryableTurn(): boolean`, `dropRetryableTurn(): void`
  - `setInterviewContinueHandler(fn | null)`, `getInterviewContinueHandler()`: **12d registers its "go to proposal" here.**
- NEW `src/styles/plan-interview.css` (tokens + logical properties), imported in `main.ts`.
- `growth-os/i18n/{en,fa}.ts`: `growth.planInterviewPage.{intro, introWithCandidates, counter, log, input, send, thinking, retry, done}`.
- NEW tests: `smoke/plan-interview-view.test.ts` (19).

## Behaviour
- Mount seeds the slice from `getPlanCandidates()` ONLY while no turn was answered (messages 0, turnCount 0, idle, not ready); a started interview is never overwritten. Opening / re-rendering / switching language sends nothing.
- Send: `buildInterviewRequest` -> `markAsking` -> `apiClient.planInterview(body, getLang())` -> `applyInterviewResponse(..., userText)`. Enter sends, Shift+Enter = new line, blank answer = field error. One lock key (`"plan-interview"`) shared by Send and Try again: input and buttons disabled while loading, a second send is ignored.
- The user turn is recorded ONLY on success, so a retry cannot duplicate it. The typed text stays in the input (draft store) until the turn succeeds.
- 5xx: `status: "error"`, `ApiError` kept in the slice, banner = `errorMessage(error)`, **Try again** re-sends the stored request unchanged (same body, same `lang`). No Try again for `auth` (handled by `handleAuthExpiry`) or `validation` (it would fail the same way).
- 429: no error state and no banner. The slice goes back to idle, the lock shows `errors.rateLimit` ("please wait a moment…") and keeps Send disabled for 3 s. The text is still in the input.
- Counter "Question n of 5" = `min(turnCount, 5)` from the response. `ready` or `isTurnLimitReached`: input + Send disabled, a `role="status"` message, focus moves to it. The "See the proposal" button exists only when a handler is registered (12d).
- A language switch rebuilds the view from the slice: transcript, counter, typed draft, error state + Try again, and a request still in flight (the new view starts locked and gets the result) all survive; no refetch.
- A11y: `<ol role="log" aria-live="polite">`, append-only (a message node is never repainted, so it is announced once), each message has a visually hidden "You:" / "Assistant:", labelled textarea, focus returns to the input after every settled turn (also after an error and after a 429).

## Things to know
1. **The counter does not start at 1.** The backend sets `turn_count = len(messages) + 1`, so the first answer already shows "Question 2 of 5" and the last allowed one "5 of 5" after about 2 to 3 answers. I show the backend value as is. If it looks odd in review, the fix is a copy / formatting choice (e.g. hide the counter until the first answer), not a state change.
2. `apiClient.planInterview` still puts `null` for `known_available_hours` / `known_energy_window` and `[]` for `known_candidates` on the wire (see 12a, point 2). Not changed; say so and I fix it with its test.
3. Retry keeps the language of the ORIGINAL request, so a Persian question that failed is retried in Persian even if the UI was switched to English meanwhile. Sending a new answer uses the current language.
4. The 1000-character cap on the answer is a UI choice (the backend gives none for message content).
5. There is no "start over" button: once ready, the interview cannot be restarted from this page. 12d (or a later part) decides where `resetInterview()` is called.
6. Persian copy is mine: needs a native skim.

- Commit: feat(plan): chat-like Plan interview view (send / retry through submitLock, counter, ready + limit states, a11y log, fa+en)
