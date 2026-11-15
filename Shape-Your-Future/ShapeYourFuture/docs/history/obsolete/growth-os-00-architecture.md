> OBSOLETE (moved in Step 4): written before the app was reduced to Today, Reflect, Coach and Profile. It describes features that no longer exist. Kept as history only.

# Shape Your Future — Growth OS: Architecture & Plan (Step 1)

## 1. Architecture (as found in the repository)

| Layer | Reality in the repo | Note |
|---|---|---|
| Frontend | **Vanilla TypeScript + Vite** (`frontend/`, no React dependency) | The brief says React. The current UI is DOM-helper based (`lib/dom.ts`, `views/*`). See "Decision needed" below. |
| Backend | Python **FastAPI** (`backend/app/`): `api/routes`, `services`, `graphs`, `schemas`, `db`, `llm` | Already has `conversation` route + `conversation_manager` service, which the chat-first UX can build on. |
| Design system | Cyber-Zen / Aurora, dark default + light, CSS variables | Now centralised in `src/styles/tokens.css`. |
| i18n | fa / en dictionary (`lib/dictionary.ts`), RTL/LTR via `<html dir>` (`lib/theme-i18n.ts`) | Locale rules now in `lib/locales.ts`. |

### Decision needed: React vs. current vanilla TS
Steps 1–2 were implemented on the existing vanilla TS code so nothing breaks and
every file compiles with the current toolchain. If React is a hard requirement,
the migration path is: add `react`, `react-dom`, `@vitejs/plugin-react`; mount a
React root next to `#app`; wrap legacy views in a `LegacyView` adapter; migrate
view by view. The tokens, locale table and dictionaries carry over unchanged.

## 2. Design tokens — `frontend/src/styles/tokens.css`
1. **Theme tokens** (dark / light via `[data-theme]`): surfaces, text, Cyan
   accent, Violet, Emerald (`--color-emerald`), danger, glows, radii, shadows,
   fonts, chat surfaces (`--color-chat-*`), sidebar.
2. **Static tokens**: spacing (`--space-1..8`), type scale (`--text-*`),
   layout widths, z-index layers, brand gradients.
3. **Direction tokens**: `--gradient-inline-angle` flips 90° ↔ 270° with `dir`.

Existing variable names are unchanged; `style.css` now `@import`s the file.

## 3. i18n structure (fa / en, RTL / LTR)
```
src/lib/locales.ts        LANG_META: dir, BCP-47 locale, switcher labels, order
src/lib/dictionary.ts     core copy; embeds feature dictionaries (dict.growth)
src/lib/theme-i18n.ts     state + persistence; syncs <html lang dir data-theme>
src/growth-os/i18n/en.ts  Growth OS copy (source of truth for the shape)
src/growth-os/i18n/fa.ts  typed as typeof growthEn -> missing key = compile error
```
Rules: CSS uses logical properties only (`inline-start/end`, `text-align: start`);
gradients use `--gradient-inline-angle`; directional icons get a `.flip-rtl` class.

## 4. Folder structure for Growth OS (respecting existing `src/`)
```
frontend/src/
  api/            (existing) + chat endpoints added here
  lib/            (existing) shared helpers, header, theme-i18n, locales
  state/          (existing) journey.ts
  views/          (existing) legacy step views stay as-is
  styles/         tokens.css  (+ growth-os.css when the OS shell lands)
  growth-os/
    index.ts      public entry (only import path used outside this folder)
    types.ts      GrowthFeature, ids
    registry.ts   declarative list of OS areas (chat, today, goals, insights)
    i18n/         en.ts, fa.ts
    chat/         (Step 3) conversation UI: thread, composer, message bubbles
    shell/        (Step 3) sidebar / bottom-nav + workspace layout
    widgets/      (later) goal card, plan timeline, insight tiles
backend/app/
  api/routes/conversation.py   (existing) chat entry point
  services/conversation_manager.py (existing)
  graphs/                      (existing) planning/progress/growth graphs
  (new only if needed) api/routes/growth_os.py aggregate "OS state" endpoint
```

## 5. Implementation plan
1. **Step 1 (done):** tokens, locale table, feature i18n, `growth-os/` skeleton, docs.
2. **Step 2:** Shell — header (logo, name, theme, language switcher), i18n provider
   syncing `lang`/`dir`, logical-property CSS audit.
3. **Step 3:** chat-first landing view using `/conversation` API.
4. **Step 4:** chat → OS transition (sidebar/nav from `registry.ts`, wrap existing
   goal/plan/focus views).
5. **Step 5:** insights widgets from existing behaviour/learning services.

## 6. Step 6 — Dashboard & progress tracking (done)
New `DASHBOARD` journey step, reachable from the header ("Dashboard" / «داشبورد»).

```
frontend/src/
  views/dashboard.ts    render only: Today's Focus, goal rings, heatmap,
                        daily actions, check-in, charts (each panel redraws alone)
  state/dashboard.ts    store + pure helpers (heatmap grid, streak, dates)
  lib/charts.ts         dependency-free SVG/CSS charts: progressRing, barChart, heatmap
  growth-os/i18n/*      `dashboard` copy (en + fa)
  style.css             `.dash-*`, `.ring*`, `.bars*`, `.heat*` (tokens + logical props only)
```

**Data (all real endpoints, no backend changes)**
- `GET /daily-plan` → Today's Focus + daily actions (plan failures are soft: the rest still renders).
- `GET /goals` + `GET /goals/{id}/tree` → rings, heatmap, streak, weekly chart. The trees are the single
  source of truth; a checkbox (`PUT /goals/next-actions/{id}/status`) patches them and everything re-derives.
- Check-in → `PUT /user-intelligence/energy` (Low/Med/High → 3/6/9 on the backend's 1–10 scale) and
  `PUT /user-intelligence/habits` (`sleep: {quality, date}`), best effort.

**Device-local (no backend endpoint exists yet)** — namespaced per user (`maketime:dash:<user>:…`):
- postpone / skip marks (per day), shown in a "Postponed and skipped" group with Restore;
- check-in history (last 30 days) feeding the energy/sleep trend charts.
Follow-up: a `scheduled_for` update endpoint would let "Postpone" move an action to tomorrow for real.
