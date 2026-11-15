# Part 20b: journey CTAs, sign-up -> active hours -> Brain Dump / goal -> decompose -> planning -> daily plan (HANDOFF)

Navigation only. No endpoint, no page, no existing button or flow removed or changed. Every CTA is `JourneyNextStep` (`lib/journey-next-step.ts`); the rules live in `state/journey-map.ts`.

## Verified
- `tsc --noEmit`: 10 errors, same 10 as the 20a zip (all from the 3 missing Part 17b files). Nothing new.
- `npm run check:i18n`: OK.
- 28 new tests (`smoke/journey-cta-20b.test.ts`). Full vitest: 90 failures in the same 6 files as the baseline (my-profile-form-view, my-profile-save-state, my-profile-save-view, plan-confirm-feedback, ui-habits-discard-completeness, ui-habits-save). Passing 1992 -> 2020.
- Mutation check: 22 deliberate breaks, 21 caught. The survivor: `views/decomposition.ts` passes `facts: { planningNone }` explicitly, but the journey store holds the same answer there, so removing it changes nothing. Kept as a guard against a stale store (the Goals screen needs it and that one is tested).
- 2 existing tests changed because the map changed on purpose (`journey-map.test.ts`: 15 steps, active hours -> My profile, no-goal -> Goals; `journey-next-step.test.ts`: no-goal gives the Goals button, not null).

## Not verified
- No browser: look of `.journey-lead`, `.journey-welcome`, `.journey-next` (both themes, RTL, 375px).
- The My profile save-area CTA is tested against stand-ins for `state/active-hours.ts` and `state/ui-profile-form.ts` (the test creates them only if the file is missing and deletes them afterwards; none are in the zip). Run it once against your real 17b files.
- Persian copy under `growth.journey.lead` and the new `goals` / `goalTree` texts is mine: needs a native skim.

## Where JourneyNextStep was added
| Step | Screen (file) | Buttons |
|---|---|---|
| 1 sign-up / login | Chat dock, first visit only (`views/chat.ts`; flag set by `views/auth.ts`, `state/journey-welcome.ts`) | no hours: "Set my active hours" (-> My profile, Profile tab). Hours set / returning user: Brain Dump + Create a goal |
| 2 after saving hours | My profile > Profile save area (`views/my-profile-profile-save.ts`), only when that save sent `active_hours` and they are set | Brain Dump + Create a goal |
| 2 (legacy path) | Create-goal page (`views/goal-creation.ts`) | Brain Dump, beside the form |
| 3 Brain Dump confirmed | success box (`views/brain-dump.ts`), beside Plan today / Start new | goal in journey: "Break my goal into steps"; goal already decomposed: "See my goal's tree"; no goal: "Go to my goals" |
| 4 decompose succeeded | `views/decomposition.ts` result; `views/goals.ts` roadmap (only right after a decompose run here) | needs planning: "Plan my next actions" (Planning required); nothing to plan: "Open today's plan" |
| 5/6 planning | Planning-required list state (`views/planning-required-page.ts`), quiet/secondary | "Open today's plan" |
| 6 | `plan/next-actions` placeholder (`views/section-view.ts`), beside "Go to chat" | "Plan my next actions" |

All read existing stores (`state/journey-facts.ts`); none sends a request; all rebuild in the new language (tested, request count unchanged).

## Map changes (`state/journey-map.ts`)
- `activeHours` now points at My profile > Profile tab (`myProfileTab`, set through `myProfileStore` before opening). Legacy `CONTEXT_SETUP` is no longer in the journey; it and its own flow are untouched.
- New data rules: `satisfiedWhen` (step already done: skipped, or replaced) and `unavailableInstead` (guard not met: another step). New steps `goals` and `goalTree`. Facts: `activeHoursSet`, `goalDecomposed`, `planningNone`.
- `JourneyNextStep` gets `facts` (screen's own answer wins) and `quiet`.

## Dead ends from the 20a audit
Fixed: **D1** (Today CTA on planning list), **D2** (`plan/next-actions` now points to Planning required), **G1** (sign-up never offered active hours), **G2** (no Brain Dump branch after hours), **G3** (Brain Dump now reaches decompose, or Goals when no goal exists).
Not in these steps, left for 20c/20d: **D3** (also needs the missing Part 13c view code), **D4, D5, D6, D7**.

## Left undone / decisions
- **After a goal is created** there is no separate "Decompose" button: creation already moves straight to the decompose screen, which decomposes by itself. A pause would change the flow, so I kept it.
- **Planning-required empty state** (after the last item is accepted) keeps its existing "Go to Today" button; a second JourneyNextStep there would be a duplicate. Test enforces no duplicate.
- **Decompose result screen**: JourneyNextStep sits beside the existing Continue button, so with nothing to plan two buttons lead to the daily plan ("View plan" and "Open today's plan"). Continue still goes to the legacy planning page when items need planning (G4). Say if you want one of them hidden.
- **Already-decomposed view** (400 fallback) has no new CTA: planning state is unknown there.
- **Returning user after login**: hours are unknown without a request, so they are not nagged (they get Brain Dump + Create a goal). A new account is asked.
- The CTA opens My profile on the Profile tab; it does not scroll to the hours editor.

## Files
New: `src/state/journey-facts.ts`, `src/state/journey-welcome.ts`, `smoke/journey-cta-20b.test.ts`, `HANDOFF-part20b.md`, `existing-files-20b.patch`.
Changed: `state/journey-map.ts`, `lib/journey-next-step.ts`, `state/ui-profile-save.ts` (`hours` flag on the saved feedback), `state/ui-profile-save-flow.ts`, `views/{auth,chat,brain-dump,decomposition,goals,goal-creation,planning-required-page,section-view,my-profile-profile-save}.ts`, `growth-os/i18n/{en,fa}.ts`, `styles/components.css`, `smoke/journey-map.test.ts`, `smoke/journey-next-step.test.ts`.
