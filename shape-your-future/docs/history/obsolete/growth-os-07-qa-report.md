> OBSOLETE (moved in Step 4): written before the app was reduced to Today, Reflect, Coach and Profile. It describes features that no longer exist. Kept as history only.

# Step 7 — QA, refinement and bug fixing

**Method.** Static review of every file under `frontend/src` plus `index.html`, `nginx.conf` and
`docker-compose.yml`. `tsc --noEmit` is clean apart from three environment errors (no `node_modules`
here: the two `@fontsource-variable/*` imports and `style.css`). **Not done:** `vite build`, a real browser
run, screen-reader testing, and a review of backend logic beyond the password rule. Everything below marked
"fixed" is typechecked, not runtime-tested. Please smoke-test it (checklist at the end).

## Fixed in this bundle

**Layout shift / RTL-LTR**
- `index.html`: inline bootstrap applies stored theme/lang/dir before first paint (a returning EN or light user no longer gets the hard-coded fa/rtl/dark flash).
- `main.ts`: first render waits (max 800 ms) for the active language's font, then warms the other language's font, so fallback→webfont swaps no longer re-wrap text or happen mid-switch.
- Dashboard heatmap: keeps its horizontal scroll across redraws and opens on the newest weeks (inline-end) on narrow screens; before, it snapped back to the oldest weeks on every checkbox tick.

**Forms**
- Goal creation and availability forms no longer wipe what the user typed on a validation or API error, nor on a language switch (module-level drafts, errors go to a slot instead of rebuilding the form). Both are real `<form>`s with localized (`novalidate`) messages, hint text wired with `aria-describedby`, and focus moved to the offending field. Availability shows a live "start must be before end" hint. Priority is validated 1–5 (it used to send out-of-range values through).
- Auth checklist: met / not-met state is now exposed to screen readers (visually hidden text), inputs point to their checklist via `aria-describedby`, autofill that does not fire `input` events is picked up (`change` + delayed resync), double-announced error slot fixed. The symbol hint no longer suggests `@` or `.` are special (any ASCII punctuation is accepted, matching `backend/app/core/security.py`).
- Planning-required: labels were not associated with their inputs; now `for`/`id`, numeric input mode, range hint. Focus-feedback radio groups now have accessible names.

**Persona**
- One name everywhere: "AI mentor" (EN) / «همراه هوشمند» (FA). Removed "coach"/«مربی» from context, decomposition, planning-required, dashboard check-in messages and the HTML meta description.
- One register in FA (informal singular, as in the chat): three formal strings (`errors.generic`, `errors.network`, `auth.wait`) aligned.

**Accessibility**
- Chat: sender ("You" / "AI mentor" / "Notice") is announced per message; an `h1` exists; the log no longer re-announces the whole history after a language switch.
- App shell: focus moves to `<main>` on every real navigation (skip on first paint); the chat view's store listener is released when leaving chat.
- Dashboard FA: `Postpone` / `Skip` / `Restore` accessible names now contain the visible label text (WCAG 2.5.3); "Start focus" keeps keyboard focus when its panel redraws; heatmap exposes one summary instead of ~110 unnamed cells.

## Open items before go live

**High**
1. Daily Plan re-fetches on every language switch (content collapses to "Loading…" then re-expands = visible layout shift). Switching language during "Generating structure…" on Decomposition fires a second `POST /decompose`, which the backend rejects as already decomposed. Both need the result cached in `journey` state like Dashboard/Workspace/Chat.
2. ~~Server error text is shown raw.~~ **Fixed in step 8:** `errorMessage(err, context?)` in `lib/dom.ts` now maps the error kind (network / 429 / 5xx / 404 / 401 / 400-422) to i18n strings (`errors.*` in `lib/dictionary.ts`). Login 401 reads "incorrect username or password", any other 401 "session expired"; register 400 reads "can't create an account". Known backend 400 texts (no active hours, nothing plannable, already decomposed) are mapped; other 400/422 texts are shown only if they are in the UI language, otherwise a generic "check your input" message. The dashboard load error now stores the `ApiError` and localizes at render time. Still string-in-state (not re-translated on a language switch): chat notice, goal-workspace `error`/`notice`. Typechecked, not runtime-tested.
3. Production config is still dev: `APP_ENV=development`, throwaway `SECRET_KEY`, CORS limited to localhost, `LLM_PROVIDER=groq` with an empty key by default (chat then only shows a generic error). `nginx.conf` has no security headers/CSP, no gzip, no cache headers for hashed assets. If a CSP is added, the new inline bootstrap script needs a hash or nonce.
4. No frontend tests and no CI (backend has tests).

**Medium**
5. Contrast: `--color-text-faint` is 3.7:1 (dark) / 2.9:1 (light) and is used for unmet checklist rows, hint titles and placeholders; light-theme primary button is white on `#0ea5e9` (2.8:1). Needs a token decision.
6. Dashboard first load swaps a "Loading…" line for the full multi-panel layout (big shift). Reserve panel heights or use skeletons.
7. Language switch still resets: Focus-feedback selections, Planning-required numbers, chat scroll position.
8. Header at ≤ 360 px when signed in: app name is truncated to a letter or two (estimated from widths, not measured). Hide the name below ~400 px.
9. Heatmap cells only have a mouse `title` tooltip (no keyboard/touch equivalent).
10. Auth submit is disabled until every rule passes. If the spec means "hints only", enable it and let the server decide.
11. Only Auth has a true live checklist; other forms have static hints plus submit-time validation.

**Low**
12. No per-view `document.title`, no `<nav>` landmark, no logout confirmation.
13. Unused copy: `growth.nav.today/goals/insights`, `chat.emptyTitle/emptyHint`.
14. `tsconfig.tsbuildinfo` is committed; the compiled EN/FA `errors.*` are only used for network/generic.

## Smoke test after `npm install && npm run dev`
1. Reload as EN/light: no dark/RTL flash. Reload as FA: no visible font swap.
2. Register: checklist rows read "met / not met" with a screen reader; autofill enables the button.
3. Goal form: submit empty, then with priority 9. Typed values must survive; toggle FA/EN mid-typing.
4. Chat: send a message, toggle language, confirm history is not re-read; check FA labels on the dashboard action buttons.
5. Dashboard on a 375 px viewport: heatmap opens on today's week; tick an action, scroll stays put.
