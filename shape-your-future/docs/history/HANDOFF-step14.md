# HANDOFF step 14 (final): checks, smoke test, AUDIT

## Done
- Ran every check on the unzipped Step 13 zip: pip install, pytest, npm ci, tsc, build, check:i18n, vitest (results in AUDIT.md).
- docs/growth-os/09-smoke-test.md rewritten for the 4 screens (Today, Reflect, Coach, Profile) + sign-in/nav.
- AUDIT.md (root): 18 open rows "Problem / Severity / File / Suggested fix" + evidence RUN/STATIC + RUN/NOT RUN table.
- Old audit moved to docs/history/AUDIT-crash-and-halfdone-step6.md; README links updated.
- Only docs changed; no code.

## Results
pytest RUN 1240 pass / 4 fail (rate-limit); npm ci, tsc, build, i18n RUN ok; vitest RUN 25 files, 258 pass.
NOT RUN: Docker build/up, browser smoke test, real LLM, secret scanner.

## Most important open items
1 revoke the leaked key (HANDOFF-part24 holds a fragment); 2 Coach uses UTC day; 3 no Retry-After; 5 chat stores AI plan before confirm; 7 fixed dev SECRET_KEY.
