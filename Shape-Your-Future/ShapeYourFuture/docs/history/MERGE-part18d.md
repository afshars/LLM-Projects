# Merge note: Part 18d added to the 20b project

Your `project-ui2-part18d.zip` was built on the 18c-2b zip, so its 18d work was missing from the 19/20 line. Merged in (HANDOFF-part18d.md is the original, unchanged):

- New: `state/my-profile-overview.ts`, `state/ui-distractions-save.ts`, `state/ui-distractions-save-flow.ts`, `views/my-profile-distractions.ts`, `views/my-profile-distractions-save.ts`, `views/my-profile-overview.ts`, `smoke/ui-distractions.test.ts`, `smoke/my-profile-overview.test.ts`.
- Replaced by the 18d version (they had no 19/20 changes): `state/ui-save-core.ts`, `state/ui-distractions.ts`, `views/my-profile-tabs.ts`, `views/my-profile.ts`, `styles/my-profile.css`.
- Merged by hand (18d blocks added, my 19b/20 blocks kept): `growth-os/i18n/en.ts`, `growth-os/i18n/fa.ts` (18d: `myProfilePage.distractionsForm`, `myProfilePage.overview`, reworded `panels.distractions`).
- Not taken from the 18d zip: everything else that differed (client.ts, dictionary.ts, dom.ts, journey.ts, style.css, components.css, auth/chat/brain-dump/goals/... views, ui-profile-save*): those are 19a/19b/20 changes that only exist in this project.
- Test fixes: both 18d test files lacked `// @vitest-environment jsdom` (added; they were never run). 4 tests in `smoke/my-profile-tabs-18a.test.ts` still described the old Distractions placeholder and were updated to the 18d behaviour (own form + guide, new one-sentence hint, Persian intro).
- Result: tsc 10 errors (same baseline), i18n parity OK, vitest 90 failures in the same 6 files as the baseline, 2047 passing.
