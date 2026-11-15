# HANDOFF part 14b: Progress Check, result view (route `reflect/progress-check`)

**Run:** `tsc --noEmit` clean, `check:i18n` OK (fa/en parity), `vite build` OK, `vitest run smoke/progress-check*` **64/64 pass** (33 new: 18 helper tests + 15 view tests). I broke the null guards on purpose (raw duration shown when null, unknown blocker type leaked) and 3 tests failed, so they do bite. **Full suite: 1282 pass, 17 fail, all in `smoke/plan-confirm-feedback.test.ts`; the same 17 fail on the untouched 14a zip, not caused by 14b (not investigated).** Not seen in a browser (CSS + both themes + RTL need a visual pass).

## Files
- NEW `state/progress-check-result.ts`: pure, null-safe, no UI. `describeBlocker`, `describeRecommendation`, `describeNextAction`, `describeProgressResult` (+ `BLOCKER_TYPES`, `RECOMMENDED_STAGES`). Input is loose (null/undefined/odd values never throw).
- NEW `lib/blocker-icons.ts`: inline SVG per type (+ `unknown`, `none`), same approach as `nav-icons.ts`.
- NEW `views/progress-check-result.ts`: `buildProgressResult(result, handlers)` returns the children of `#progress-check-result`. Exports `PROGRESS_CHECK_REVIEW_ID`, `PROGRESS_CHECK_NEXT_ACTION_ID`.
- CHANGED `views/progress-check.ts`: `drawResult` now builds the card; added `focusAccomplishments()`.
- CHANGED `growth-os/i18n/en.ts` + `fa.ts`: `growth.progressCheckPage.result.*` (removed the 14a `placeholder` key; added `clarify`, `blocker`, `nextAction`, `approach`).
- CHANGED `styles/progress-check.css`; CHANGED `smoke/progress-check-view.test.ts` (2 placeholder assertions replaced); NEW `smoke/progress-check-result-{state,view}.test.ts`.

## Behaviour
- **Blocker:** known type -> icon + label + one-line explanation + `ConfidenceBadge` (only when the confidence is a finite number; clamped to 0..1). `null`/blank type -> "No blocker detected" (check icon, no badge), whatever the confidence says. A type the UI does not know -> generic "Something got in the way" (the raw string is never shown).
- **Next step:** `next_action_fa` (`dir="auto"`, it is model text) + "N min" (`Intl` digits, rounded, hidden when null/0/NaN). No text -> "No next step this time"; a duration without a text is hidden too.
- **Approach:** stage (4 known Make Time stages translated; an unknown stage is shown as written) + "Tactic #id". Both missing -> "No specific approach was suggested". There is no client-side tactic list, so only the number is shown (title needs a tactics lookup, not part of this step).
- **`needs_clarification === true`** (strict): hint + "Edit my text" button -> focus on the accomplishments textarea, caret at the end, smooth scroll unless reduced motion; changes nothing else (same as Brain Dump 11b-5). `aria-controls` points at the textarea.
- **Redraw:** the card is rebuilt only when `slice.result` is a new object (not on keystrokes), so focus on its button survives typing. A language switch rebuilds the view and redraws from state; no request (tested).

## For 14c
- Two EMPTY slots inside the card, hidden while empty (`:empty`), each with `data-part="14c"`, a `data-slot` and an HTML comment before it: `#progress-check-review` (review + confirm) and `#progress-check-next-action` (NextAction button).
- They are created inside `buildProgressResult`, so they are replaced when the result changes. 14c should fill them from the slice (`slice.result.request` = the exact text that was checked; confirm THAT, not the drafts) and re-fill on rebuild, or ask 14b's builder to take a `renderSlots` callback.
- `ProgressConfirmRequest` has no `recommended_stage`; the card never needed to send it.

## To know
- Persian copy is mine (native skim: `result.*` in `fa.ts`; stage names "هایلایت / لیزر / انرژی / بازنگری" follow the Make Time terms).
- Backend low-confidence threshold is 0.6 (`progress_graph.py`), the badge thresholds are 0.4/0.7 (`CONFIDENCE_THRESHOLDS`), so a shown 0.6-0.7 reads "Medium".
- Commit: feat(reflect): progress check result card (null-safe describe* helpers, blocker icons + confidence badge, next step + duration, clarification hint with focus return, 14c slots, fa+en)
