# Part 17a-1 — User intelligence state slices + partial-PUT helper (HANDOFF)

No UI, no new API methods, no existing file edited. This is `/user-intelligence/*`, NOT the account profile (`state/profile.ts`, `/profile/me`), so everything new is prefixed `ui`.

**Verified:** `tsc --noEmit` (strict) clean on the 4 new files; the 8 examples pass; a stubbed-fetch run confirmed: first visit loads once, revisit/refetch skipped, refresh keeps unsaved edits, `invalidate` drops an in-flight answer, error keeps `ApiError.kind` and is not auto-retried.
**Not verified:** full `tsc -b` / `vite build` / vitest of the whole repo (no `node_modules` in the zip, no network). Run `npm run typecheck` once.

## Files (all new, in `frontend/src/state/`)

| File | What |
|---|---|
| `diffForPartialPut.ts` | pure helper, no imports |
| `diffForPartialPut.examples.ts` | 8 input/output examples + `checkDiffExamples()` (returns `[]` when all pass; not imported by the app) |
| `user-intelligence.ts` | the 3 slices, pure transitions, store, `invalidateUi…()` |
| `user-intelligence-flow.ts` | the GET requests: `ensureUi…Loaded()` and `refreshUi…()` |

## Slices

Each slice is `UiSlice<T> = { data: T | null; draft: T | null; status: "idle" | "loading" | "success" | "error"; error: ApiError | null }` (read `error.kind`).

| Slice | Data type | GET |
|---|---|---|
| `uiProfile` | `UserProfileOut` | `getUserProfile()` |
| `uiPreferences` | `UserPreferences` (`Record<string, unknown>`) | `getUserPreferences()` |
| `uiGoals` | `UserGoalsOut` | `getUserGoals()` |

Store: `userIntelligenceStore` (`get`, `getSlice`, `set`, `subscribe`, `invalidate`, `reset`, `generation`). Reset to idle when the journey arrives at AUTH.

- **First visit only:** a slice loads only when `idle`. Rebuilds, revisits and language change never refetch. An `error` slice is not retried by itself.
- **Draft:** `draft` is a deep copy of `data`. A refresh replaces `data`; the draft follows only if it had no unsaved edits. A failed load keeps both.
- **Functions:**
  - `ensureUiProfileLoaded()` / `ensureUiPreferencesLoaded()` / `ensureUiGoalsLoaded()`
  - `refreshUiProfile()` / `refreshUiPreferences()` / `refreshUiGoals()` (explicit; skipped while loading)
  - `invalidateUiProfile()` / `invalidateUiPreferences()` / `invalidateUiGoals()` (back to idle, data and draft dropped, in-flight answer discarded)
  - `setUiProfileDraft(d)` / `setUiPreferencesDraft(d)` / `setUiGoalsDraft(d)`
  - `applySavedUiProfile(a)` / `applySavedUiPreferences(a)` / `applySavedUiGoals(a)` (after a successful PUT: data and draft = server answer)
  - `resetUiProfileDraft()` / `resetUiPreferencesDraft()` / `resetUiGoalsDraft()` (discard edits)
- Flow functions resolve `"ok" | "failed" | "skipped"` and never reject. A 401 goes through `handleAuthExpiry`.

## Helper

```ts
diffForPartialPut(
  original: object | null | undefined,
  draft: object | null | undefined,
  options?: { nullable?: readonly string[] }
): { changed: boolean; body: Record<string, unknown> }
```
Also exported: `deepEqual`, `PROFILE_NULLABLE_KEYS`, types `PartialPutDiff`, `DiffOptions`.

- `body` = only changed top-level keys, each sent whole. Deep compare; arrays by order; object key order ignored. `changed` false and `body` `{}` when nothing differs (Save `disabled = !changed`).
- Never `undefined` (draft `undefined` = untouched; nested undefined is stripped).
- A key missing from the draft is untouched, not a delete.
- The third argument is an addition to the requested two-argument signature; it is how null is allowed per route.

## Where null is required (only here)

- **`PUT /user-intelligence/profile`**: explicit `null` clears a plain field (`UpdateProfileRequest`, `str | None` / `int | None`, applied with `model_dump(exclude_unset=True)`, then `setattr(row, field, None)`). Call with `{ nullable: PROFILE_NULLABLE_KEYS }`: `name, occupation, lifestyle, communication_style, motivation_style, planning_style, preferred_focus_duration, preferred_break_duration`. Null is sent only if the original had a value. NOT for `preferences` (dict) or `active_hours` (replaced; clear with `[]`).
- **`PUT /user-intelligence/preferences`**: no null. Body is a free dict merged with `dict.update()`, so null would be stored as a value, not clear it. Call without `nullable`.
- **`PUT /user-intelligence/goals`**: no null. Body is `{ goal_type, value: str | list[str], mode }`; null is a 422. So `current_focus_goal` cannot be cleared through this API as it stands.

## Things the next part must handle

1. **Goals are not a plain partial PUT.** The route changes ONE category per call. `diffForPartialPut(goals.data, goals.draft)` gives the changed categories; 17a-2 sends one `apiClient.updateUserGoal({ goal_type, value, mode: "set" })` per key of `body`, then `applySavedUiGoals` with the last answer (each answer holds all categories). If one call fails, the earlier ones are already saved: re-diff against the updated data.
2. **Nested removals can't be sent.** `profile.preferences` is deep-merged and `/preferences` merges per top-level key, so a key the user deletes from a nested object stays on the server. The diff sends the whole changed value, never a deletion.
3. **`profile.preferences` and `/preferences` are the same stored dict** exposed twice. If a form saves through one, call the other's `invalidateUi…()`.
4. The diff body for `uiProfile` must exclude `user_id` (never edited, so it is never in the diff as long as the form leaves it unchanged).
