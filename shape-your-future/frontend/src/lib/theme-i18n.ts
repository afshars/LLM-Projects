/**
 * Theme & i18n state manager.
 *
 * - persists `theme` and `lang` in localStorage,
 * - keeps <html data-theme | lang | dir> in sync (dir="rtl" for fa),
 * - exposes the bilingual dictionary via `t()`.
 *
 * It no longer builds any DOM or injects <style> tags: the persistent
 * header lives in lib/header.ts and every style lives in style.css.
 */

import { DICTIONARIES } from "./dictionary";
import type { Dictionary, Lang } from "./dictionary";
import { LANG_META } from "./locales";

export type { Dictionary, Lang, StepKey } from "./dictionary";
export type Theme = "dark" | "light";

export interface ThemeI18nState {
  theme: Theme;
  lang: Lang;
}

type Listener = (state: ThemeI18nState) => void;

const STORAGE_KEY_THEME = "maketime:theme";
const STORAGE_KEY_LANG = "maketime:lang";
const DEFAULT_THEME: Theme = "dark";
const DEFAULT_LANG: Lang = "fa";

const THEME_COLORS: Record<Theme, string> = { dark: "#0b1020", light: "#f4f7fb" };

let state: ThemeI18nState = { theme: DEFAULT_THEME, lang: DEFAULT_LANG };
let listeners: Listener[] = [];

/** Current dictionary for the active language. */
export function t(): Dictionary {
  return DICTIONARIES[state.lang];
}

export function onThemeI18nChange(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function emit() {
  for (const listener of listeners) listener(state);
}

export const getState = (): ThemeI18nState => state;
export const getTheme = (): Theme => state.theme;
export const getLang = (): Lang => state.lang;
export const getDir = (): "rtl" | "ltr" => LANG_META[state.lang].dir;
export const isRtl = (): boolean => getDir() === "rtl";
/** BCP-47 locale for Intl / toLocale*String. */
export const getLocale = (): string => LANG_META[state.lang].locale;

// ---------------- Persistence ----------------

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback; // storage unavailable: work in-memory for this session
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY_THEME, state.theme);
    localStorage.setItem(STORAGE_KEY_LANG, state.lang);
  } catch {
    /* in-memory only */
  }
}

// ---------------- Document sync ----------------

function applyDocumentAttributes(): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", state.theme);
  root.setAttribute("lang", state.lang);
  root.setAttribute("dir", getDir());
  document.title = t().appName;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[state.theme]);
}

// ---------------- Setters ----------------

export function setTheme(theme: Theme): void {
  if (theme === state.theme) return;
  state = { ...state, theme };
  applyDocumentAttributes();
  persist();
  emit();
}

export function setLang(lang: Lang): void {
  if (lang === state.lang) return;
  state = { ...state, lang };
  applyDocumentAttributes();
  persist();
  emit();
}

export const toggleTheme = (): void => setTheme(state.theme === "dark" ? "light" : "dark");
export const toggleLang = (): void => setLang(state.lang === "fa" ? "en" : "fa");

/** Load persisted preferences and sync <html>. Call once, before the first render. */
export function initThemeI18n(): void {
  state = {
    theme: readStored<Theme>(STORAGE_KEY_THEME, ["dark", "light"], DEFAULT_THEME),
    lang: readStored<Lang>(STORAGE_KEY_LANG, ["fa", "en"], DEFAULT_LANG),
  };
  applyDocumentAttributes();
}
