import { getLang, t } from "../lib/theme-i18n";
import type { Dictionary, Lang } from "../lib/theme-i18n";

/** What a container-based view (`render…(container, context)`) needs from the app: the active language and its
 * dictionary. Passed in explicitly so the view stays testable and never has to reach for globals itself. */
export interface ViewContext {
  lang: Lang;
  dict: Dictionary;
}

/** Snapshot of the current language + dictionary. Call it again after a language change (app.ts re-draws on every
 * change anyway). */
export function currentViewContext(): ViewContext {
  return { lang: getLang(), dict: t() };
}
