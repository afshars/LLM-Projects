# HANDOFF step 12: Coach (one tactic) + Profile trim + final nav

## Done
- Backend `/coach/tactic`: `suggest` (AI proposes ONE tactic, saves nothing), `confirm` (explicit user yes; writes
  `DailyEntry.coach_tactic_id/coach_blocker_type`), `today` (read). Reuses progress_graph nodes
  (classify -> blocker_map family -> pick from that stage -> grounding gate); no phrase_next_action LLM call.
- Low confidence / unknown blocker type -> `needs_clarification`, no tactic. Confirm re-validates id via find_tactic.
- Answer carries both languages (title/description en+fa): language switch needs no new request.
- DB: 2 nullable columns on dailyentry + idempotent SQLite migration (`_DAILY_ENTRY_COLUMN_MIGRATIONS`).
- Frontend: `state/coach-tactic.ts` (store, epoch guard, reset on logout), `views/coach-tactic.ts` card at the top of the
  Coach screen (obstacle -> suggestion -> "Use this tactic" / "Not this one"), `styles/coach.css`.
- Nav label chat -> Coach (en "Coach", fa "کوچ"); nav is Today, Reflect, Coach, Profile.
- Profile = language, theme, account (display name, password), logout. Avatar + bio UI removed (`lib/avatar.ts`,
  `setAvatar`, AVATAR_* types, avatar CSS/i18n). PUT /profile/me passes the stored bio through unchanged.

## Checks
tsc RUN ok; build RUN ok; check:i18n RUN ok; vitest RUN 25 files / 258 pass; pytest RUN 1240 pass, 4 fail
(the known rate-limit tests B5/B6, same as baseline).

## Assumptions / left
- Header still has language/theme/logout buttons (global); Profile now also has them. Remove from header if wanted.
- Backend `/profile/me/avatar` + bio columns untouched (no UI uses them): candidate for backend cleanup.
- Orphaned: `/chains/progress-check(+confirm)` and its graph's classify->phrase path; `createGoal` in client;
  old daily-plan frontend leftovers. Chat still runs the legacy /conversation planning chat under the card.
- Tactic is not yet shown on Today/Reflect (stored only).
