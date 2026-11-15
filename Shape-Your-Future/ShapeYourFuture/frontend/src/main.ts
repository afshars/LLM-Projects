import "@fontsource-variable/inter";
import "@fontsource-variable/vazirmatn";
import "./style.css";
import "./styles/components.css";
import "./styles/focus.css";
import "./styles/today.css";
import "./styles/reflect.css";
import "./styles/shell.css";
import "./styles/profile.css";
import "./styles/coach.css";
import "./styles/chat.css";
import "./styles/chat-history.css";
import "./styles/refresh.css";
import { startApp } from "./app";
import { installGlobalErrorHandlers, reportAppError } from "./lib/app-error";
import { appErrorPanel } from "./lib/ui/app-error";
import { getLang, initThemeI18n } from "./lib/theme-i18n";
import type { Lang } from "./lib/theme-i18n";

const root = document.getElementById("app");
if (!root) throw new Error("#app root element not found");

// Load persisted theme/language and set <html data-theme|lang|dir> BEFORE
// the first render, so there is no flash of the wrong theme or direction.
initThemeI18n();

// Uncaught exceptions and unhandled promise rejections end up in the translated error banner (app.ts)
// instead of vanishing into the console.
installGlobalErrorHandlers(window);

/** One probe per language: the font face + a sample of text in its script, so the
 * browser fetches exactly the unicode-range subset that will be used. */
const FONT_PROBES: Record<Lang, { font: string; sample: string }> = {
  fa: { font: '16px "Vazirmatn Variable"', sample: "آینده‌ات را بساز ۰۱۲۳ abc" },
  en: { font: '16px "Inter Variable"', sample: "Shape Your Future 0123" },
};
const FONT_WAIT_MS = 800;

/** Resolves when the language's font is ready, or after FONT_WAIT_MS at most, and never rejects. */
function fontReady(lang: Lang): Promise<unknown> {
  if (!("fonts" in document)) return Promise.resolve();
  const { font, sample } = FONT_PROBES[lang];
  const timeout = new Promise((resolve) => window.setTimeout(resolve, FONT_WAIT_MS));
  return Promise.race([document.fonts.load(font, sample), timeout]).catch(() => undefined);
}

// First render waits for the active font: swapping fallback -> webfont after paint is what
// re-wraps text and shifts layout (worst in Persian). The cap keeps a slow network from
// leaving the screen blank. Afterwards the OTHER language's font is warmed in the
// background so a later language switch does not swap fonts mid-view.
/** Starts the app; if even that fails the page shows the translated error panel (Try again re-runs it)
 * instead of staying white. */
function boot(): void {
  try {
    startApp(root as HTMLElement);
  } catch (error) {
    reportAppError(error, "startup");
    (root as HTMLElement).replaceChildren(appErrorPanel({ error, onRetry: boot }));
  }
}

void fontReady(getLang())
  .then(() => {
    boot();
    void fontReady(getLang() === "fa" ? "en" : "fa");
  })
  .catch((error) => reportAppError(error, "startup"));
