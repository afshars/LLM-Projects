# Part 17a-2 — "My profile" page shell with accessible tabs (HANDOFF)

Shell only: tabs, panels, containers, AsyncPanel states. No forms (17b Profile, 17c Preferences, 17d Goals). No new API calls (uses the 17a-1 slices).

**Verified:** `tsc` strict clean on all of `src/` (only `main.ts` CSS side-effect imports fail here, because the zip has no `node_modules`/vite types; same without my change); `check:i18n` OK (1251 values, en = fa); and a real-browser run (headless Chromium, 375px, stubbed API) of 24 checks: ARIA wiring, roving tabindex, ArrowLeft/Right + Home/End + wrap, RTL arrow swap, active tab kept across a fa/en rebuild with zero requests, only the open tab loads, revisits never refetch, skeleton / empty guide / error + Try again / recovery, `invalidateUi…()` reloads a visible tab once, no horizontal page scroll with 8 tabs (the tab row scrolls inside its own box).
**Not verified:** vitest (`smoke/my-profile-state.test.ts`, pure rules only, written but not run: no vitest in this environment), and how it *looks* in both themes. Persian copy is mine: have a native speaker skim `growth.myProfilePage` in `fa.ts`.

## Where it lives
Route **`profile/smart-profile`** (the "Smart profile" placeholder from Part 4; label and description unchanged). Wired in `views/section-view.ts` `ROUTE_VIEWS`. `profile/preferences`, `profile/energy` and `profile/habits` are still placeholders and untouched: decide in Part 18 whether they redirect into tabs or are removed from the registry.

## Files
New (`frontend/src/…`): `state/my-profile.ts`, `views/my-profile.ts`, `views/my-profile-tabs.ts`, `views/my-profile-slice-tab.ts`, `styles/my-profile.css`, `smoke/my-profile-state.test.ts` (in `frontend/smoke/`).
Changed (also in `existing-files-17a-2.patch`): `main.ts` (+1 CSS import), `views/section-view.ts` (+2 lines), `growth-os/i18n/en.ts` and `fa.ts` (new `myProfilePage` block).

## Ids
| Id | What |
|---|---|
| `#my-profile-view` | page root |
| `#my-profile-tab-<id>` / `#my-profile-panel-<id>` | tab button / tabpanel (`id` = tab definition id) |
| **`#my-profile-profile-body`** | Profile body, filled in **17b** |
| **`#my-profile-preferences-body`** | Preferences body, filled in **17c** |
| **`#my-profile-goals-body`** | Goals body, filled in **17d** |

Tab ids: `profile`, `preferences`, `goals`. Data attributes: `data-my-profile-tab`, `-panel`, `-body`.

## Tab definition type (exported from `views/my-profile-tabs.ts`)
```ts
export type MyProfileTabKey = keyof (typeof growthEn)["myProfilePage"]["tabs"];
export interface MyProfileTabDef {
  id: string;                 // stable, unique; also the remembered active tab
  labelKey: MyProfileTabKey;  // label in growth.myProfilePage.tabs AND copy in .panels
  containerId: string;        // stable DOM id of the body container
  render: (container: HTMLElement) => void | (() => void);  // may return a cleanup
}
export const MY_PROFILE_TABS: readonly MyProfileTabDef[];
```
`renderMyProfilePage(tabs = MY_PROFILE_TABS)` builds everything (tablist, panels, ids) only from that array.

## How to add a tab (Part 18: Energy, Habits, Distractions)
1. i18n in both languages: `growth.myProfilePage.tabs.<key>` and `growth.myProfilePage.panels.<key>` = `{ label, intro, empty: { title, nextStep }, ready }`. A missing key is a compile error (the label/panel lookups are typed by `MyProfileTabKey`; `fa` is typed against `en`).
2. Append `{ id, labelKey, containerId: "my-profile-<id>-body", render }` to `MY_PROFILE_TABS`. For a slice-backed tab, `render` = `mountSliceTab(container, options)` (see `sliceOptions` in `my-profile-tabs.ts`); add the new slice to `LOADERS` in `my-profile-slice-tab.ts`.
3. Nothing else: not the page, not `state/my-profile.ts`, not the CSS.

`mountSliceTab` loads the slice when idle, redraws on slice change, and reloads right away if `invalidateUi…()` hits a visible tab. It returns a cleanup. A tab's `render` is called the first time the tab is opened in a page build, so unopened tabs send no request.

## What 17b–17d replace
Each tab's `renderReady` (today a one-line "editing arrives in the next update" note) and usually `isEmpty` (once a form exists, an empty profile should show the form, not the empty guide; the guide's "Open chat" action is a placeholder choice). The panel is redrawn only when status / error kind / empty flag / the `data` object changes, never for a `draft` change, so a form keeps focus while typing. A save (`applySavedUi…`) replaces `data` and so redraws the body: render the form from `draft`, not from DOM state.

## Behaviour decisions
- Active tab: `myProfileStore` (string id, reset on login step); unknown id falls back to the first tab.
- Arrow keys activate the tab (same as the Behavior page); RTL swaps Left/Right.
- Refresh with data on screen keeps the content (no skeleton flash); a failed refresh shows the error + Try again.
- No Refresh button in this part (Try again on error only); easy to add per panel if wanted.
- Page title is the route label "Smart profile". To call it "My profile", change `routes.smartProfile.label` in en/fa.
