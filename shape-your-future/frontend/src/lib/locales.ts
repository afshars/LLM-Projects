/**
 * Locale metadata: the one place that knows which languages exist and how
 * each one behaves (text direction, BCP-47 locale, switcher labels).
 *
 * Adding a language = add its dictionary in lib/dictionary.ts and one entry
 * here. theme-i18n.ts derives `dir`, `lang` and the Intl locale from this
 * table, so nothing else hard-codes "fa" / "rtl".
 */
import type { Lang } from "./dictionary";

export type { Lang };

export type Direction = "rtl" | "ltr";

export interface LocaleMeta {
  dir: Direction;
  /** BCP-47 tag for Intl / toLocale*String. */
  locale: string;
  /** Short label shown in the language switcher. */
  short: string;
  /** Native name (used as accessible label for the switcher option). */
  nativeName: string;
}

export const LANG_META: Record<Lang, LocaleMeta> = {
  fa: { dir: "rtl", locale: "fa-IR", short: "FA", nativeName: "فارسی" },
  en: { dir: "ltr", locale: "en-US", short: "EN", nativeName: "English" },
};

/** Order in which languages appear in the switcher. */
export const LANG_ORDER: readonly Lang[] = ["fa", "en"];
