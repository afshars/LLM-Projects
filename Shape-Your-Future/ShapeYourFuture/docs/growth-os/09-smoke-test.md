# 09 - Manual smoke test (4-screen app)

A checklist for a person, not a program. Four screens, about 3 to 5 minutes each. Tick a box only when you saw the expected result with your own eyes; otherwise leave it empty and write the failure in the log at the end. Copy this file for each run (`09-smoke-test-run-DATE.md`) and tick the copy.

The automated checks (pytest, tsc, build, check:i18n, vitest) are listed in `README.md`. They do not replace this list: nobody has driven the app in a real browser in the steps that built it (see `AUDIT.md`).

## How to run

1. Start the app: `docker compose up --build` (frontend http://localhost:3010, backend http://localhost:8010) or the two dev servers in `README.md` section 3.
2. Put `LLM_API_KEY` (and provider settings) in `.env`. Without it everything except the Coach tactic works; the Coach shows the "AI assistant is not available" message, which is the check in 4.6.
3. Use a fresh user per pass: 3 to 30 characters, letters, numbers, dot or underscore; password with 8+ characters, lower, upper, number and symbol. Register allows 5 attempts a minute from one computer (the 429 answer says how many seconds to wait).
4. Two passes: A in English, B in Persian (right-to-left). In pass B check that the text reads naturally and the layout mirrors.
5. Keep F12 > Network (Fetch/XHR) open. Several checks say "no request" or "one request".
6. For the narrow-screen checks set the browser width to 375 px.

## 0. Sign in and navigation (2 min)

- [ ] Register, then sign in. You land on **Today**.
- [ ] The main navigation has exactly four items: **Today, Reflect, Coach, Profile & Settings**. No "More" menu, nothing marked "coming soon".
- [ ] Each item opens its screen; the current one is marked (`aria-current`). On 375 px the navigation is a bottom bar and nothing overflows sideways.
- [ ] A reload keeps you signed in. A wrong password shows an error, not a blank page.
- [ ] Stop the backend and click between screens: each shows a translated error with a "Try again" button, never a blank page. Start it again, press "Try again": the screen loads.

## 1. Today (3 min)

- [ ] Highlight: type one sentence, press Enter (or leave the field). "Saved" appears. Reload: the text is still there.
- [ ] Set a time under "When? (optional)". Clear the Highlight: the time cannot be set without a Highlight ("Write your Highlight first.").
- [ ] Laser: tick the 3 checks. Energize: tick the 4 checks. Each tap saves by itself (Network: one `PUT /daily-entry/today` per change, only the changed key). Reload: the ticks stay.
- [ ] Focus timer (optional): start it, stop it. Start and let a short one finish: "Time is up" appears.
- [ ] Stop the backend, tick a check: "This isn't saved yet." and "Try again" appear, the tick stays. Start the backend, press "Try again": "Saved".
- [ ] No points, no streak, no counters anywhere on the screen.
- [ ] Switch language and theme while a Highlight is half typed: the text is kept and there is no new `GET`.

## 2. Reflect (3 min)

- [ ] With a Highlight set today: "Did you finish your Highlight?" has one yes box. Tick it: saved. Untick: saved.
- [ ] Without a Highlight today (use a fresh user): the question is replaced by the message with a "Go to Today" button.
- [ ] Energy 1 to 10: pick a number, reload, it is still chosen. "What will you change tomorrow?": type a sentence, leave the field, reload: it is kept.
- [ ] "Last 7 days" lists seven days, each only Yes / No / No Highlight. No counts, percentages, streaks or charts.
- [ ] If the list fails to load (stop the backend only for that request), the three questions still work.
- [ ] Persian pass: the day names and digits are Persian, the layout is mirrored.

## 3. Profile & Settings (3 min)

- [ ] Panels, in order: **Preferences, Profile, Change password, Session**. No avatar picker, no bio, no other tabs.
- [ ] Preferences: choose the other language: the whole app switches at once, direction flips, no request is sent. Choose the other theme: colours switch, nothing is hard-coded white or black.
- [ ] Profile: change the display name, save: "Profile saved." (`PUT /profile/me`). Setting it back to the username stores no name.
- [ ] Change password: the button stays disabled until the rules are met and both new passwords match. A wrong current password shows "The current password is incorrect." and keeps the typed values. A correct change keeps you signed in.
- [ ] Log out: a confirmation appears; cancel keeps you signed in; confirm returns to the sign-in screen. After logging in as another user, nothing of the first user is visible (Highlight, tactic, drafts).

## 4. Coach (4 min)

The Coach screen is only the Coach card ("One tactic for today"). There is no chat and no planning on it.

- [ ] 4.1 The card asks "What is getting in the way of your Highlight today?". The button is disabled while the field is empty.
- [ ] 4.2 Write an obstacle (for example "my phone keeps pinging me") and press "Suggest one tactic". Exactly ONE tactic appears with a short name, a description and the kind of obstacle. Text: "Suggested for you. Nothing is saved until you say yes."
- [ ] 4.3 Network: `POST /coach/tactic/suggest` only. There is no `confirm` request yet. Reload now: the suggestion is gone and `GET /coach/tactic/today` returns no tactic.
- [ ] 4.4 Press "Not this one": the suggestion disappears, the field is back, still no `confirm` request.
- [ ] 4.5 Suggest again, press "Use this tactic": one `POST /coach/tactic/confirm`, then "Saved as today's tactic." Reload: the same tactic is shown. "Pick a different tactic" returns to the field and keeps the saved one until a new one is confirmed.
- [ ] 4.6 With no `LLM_API_KEY`: suggesting shows a translated "AI assistant is not available" message, the text you typed is kept, nothing is saved.
- [ ] 4.7 A vague obstacle ("meh") may answer "Say a bit more": no tactic is shown or saved.
- [ ] 4.8 Switch language with a tactic on screen: the same tactic is shown in the other language, no new request.
- [ ] 4.9 There is no message box, history or "New chat" anywhere on the Coach screen.
- [ ] 4.10 After "Use this tactic", open **Today**: a "Today's tactic" block shows the same tactic (read only). Before you confirm anything, that block says no tactic yet and offers "Ask Coach".
- [ ] 4.11 Open **Reflect**: a question "Did you use today's tactic?" with Yes / No appears only when a tactic was confirmed today. Answering saves by itself (`PUT /daily-entry/today` with `tactic_applied`); reload keeps the answer. Without a tactic the question is not shown.

## Known gaps going in

- `AUDIT.md` lists what is still open. The pytest suite is expected to pass completely (Step 4 fixed the 4 rate-limit tests).
- Today, Reflect and Coach all take the user's day from one backend helper (`?day=` or the `X-Timezone` header; Step 4). It is covered by backend tests with a pinned clock, but not checked in a real browser near midnight: if you can, set the computer's clock to 00:30 and check that a tactic confirmed in Coach appears on Today.
- Rate limits: a fast run of more than 5 registrations or 10 logins a minute from one computer answers 429 with a `Retry-After` header; wait that many seconds.

## Failure log

| # | Screen / check | What you expected | What you saw | Network or console message |
|---|---|---|---|---|
|   |   |   |   |   |
