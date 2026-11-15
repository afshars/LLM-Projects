import { CHANGE_MAX_LENGTH, ENERGY_MAX, ENERGY_MIN } from "../api/types";
import type { DailyEntry, RecentDay } from "../api/types";
import { el, errorMessage } from "../lib/dom";
import { errorBanner } from "../lib/page";
import { getLang, getLocale, t } from "../lib/theme-i18n";
import { asyncPanel } from "../lib/ui";
import { draftClear, draftGet, draftSet } from "../lib/ui/drafts";
import { journey } from "../state/journey";
import { newestFirst, recentStore, withToday } from "../state/reflect";
import type { RecentState } from "../state/reflect";
import { cleanText, localDay, todayStore } from "../state/today";
import type { TodayState } from "../state/today";

/** Unsubscribes the previously mounted instance (app.ts rebuilds this from scratch on a language change). */
let disposeActive: (() => void) | null = null;

/** The text field mirrors what is typed here, so a language change (which rebuilds the view) keeps it. */
const CHANGE_DRAFT = "reflect:change";

/** "Monday, 9 November" in the UI language; the raw ISO day if it cannot be read. */
function formatDay(iso: string, style: "long" | "short"): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y ?? NaN, (m ?? NaN) - 1, d ?? NaN);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(getLocale(), { weekday: style, month: style, day: "numeric" });
}

function question(id: string, title: string, hint: string | null, ...body: Node[]): HTMLElement {
  return el("section", { class: "card reflect-question", "aria-labelledby": id }, [
    el("h2", { id, class: "reflect-question__title" }, [title]),
    ...(hint ? [el("p", { class: "reflect-question__hint" }, [hint])] : []),
    ...body,
  ]);
}

/**
 * The Reflect screen (route reflect/evening): the three evening questions, then the last seven days.
 *
 *   1. Did you finish your Highlight?   (one yes/no box; only when today had a Highlight)
 *   2. How was your energy today?       (1 to 10)
 *   3. What will you change tomorrow?   (one sentence)
 *
 * The answers are today's DailyEntry, the same record the Today screen fills in the morning (state/today.ts): every
 * change saves by itself, there is no Save button, so the evening takes well under a minute. The list shows only
 * whether each of the last seven days' Highlight was finished (yes / no / no Highlight that day). No counts, no
 * percentages, no streaks, no charts, and nothing is written by the AI.
 *
 * Like Today, a change in a store updates the controls IN PLACE (sync()), so a tap never rebuilds the page or steals
 * focus; only a change of load status redraws. The list has its own load status: if it fails, the questions still work.
 */
export function renderReflect(): HTMLElement {
  disposeActive?.();
  const container = el("div", {});

  // Before subscribing: the synchronous "loading" they set must not reach this (not yet mounted) instance.
  void todayStore.load();
  void recentStore.load();

  /** The parts of the ready layout that change without a rebuild. Null while the panel shows something else. */
  let live: {
    withHighlight: boolean;
    done: HTMLInputElement | null;
    energy: Array<{ radio: HTMLInputElement; n: number }>;
    applied: Array<{ radio: HTMLInputElement; value: boolean }>;
    withTactic: boolean;
    change: HTMLTextAreaElement;
    status: HTMLElement;
  } | null = null;
  const recentBox = el("div", { class: "reflect-recent-box" });

  const entry = (): DailyEntry => todayStore.get().entry!;

  // ---------------- Question 1: Highlight done? ----------------

  function buildHighlightQuestion(e: DailyEntry): HTMLElement {
    const rf = t().reflect.highlight;
    if (!e.highlight) {
      const toToday = el("button", { class: "btn-secondary", type: "button", "data-reflect-go-today": "" }, [rf.goToday]);
      toToday.addEventListener("click", () => journey.goTo("DAILY_PLAN"));
      return question("reflect-q1", rf.title, null, el("p", { class: "reflect-note", "data-reflect-no-highlight": "" }, [rf.none]), el("div", {}, [toToday]));
    }
    const box = el("input", { type: "checkbox", class: "reflect-check__box", "data-reflect-done": "" }) as HTMLInputElement;
    box.addEventListener("change", () => todayStore.save({ highlight_done: box.checked }));
    live!.done = box;
    return question(
      "reflect-q1",
      rf.title,
      null,
      el("p", { class: "reflect-highlight", dir: "auto", "data-reflect-highlight": "" }, [e.highlight]),
      el("label", { class: "reflect-check" }, [box, el("span", {}, [rf.yes])])
    );
  }

  // ---------------- Tactic: did you use it? (only when Coach saved one today) ----------------

  function buildTacticQuestion(e: DailyEntry): HTMLElement | null {
    const tactic = e.tactic;
    if (!tactic) return null;
    const rt = t().reflect.tactic;
    const fa = getLang() === "fa";
    const options = ([true, false] as const).map((value) => {
      const radio = el("input", { type: "radio", name: "reflect-tactic-applied", class: "reflect-check__box", "data-reflect-applied": value ? "yes" : "no" }) as HTMLInputElement;
      radio.addEventListener("change", () => {
        if (radio.checked) todayStore.save({ tactic_applied: value });
      });
      live!.applied.push({ radio, value });
      return el("label", { class: "reflect-check" }, [radio, el("span", {}, [value ? rt.yes : rt.no])]);
    });
    return question(
      "reflect-q-tactic",
      rt.title,
      null,
      el("p", { class: "reflect-highlight", dir: "auto", "data-reflect-tactic": String(tactic.id) }, [fa ? tactic.title_fa : tactic.title_en]),
      el("div", { class: "reflect-tactic-options", role: "radiogroup", "aria-labelledby": "reflect-q-tactic" }, options)
    );
  }

  // ---------------- Question 2: Energy 1-10 ----------------

  function buildEnergyQuestion(): HTMLElement {
    const re = t().reflect.energy;
    const options: Node[] = [];
    for (let n = ENERGY_MIN; n <= ENERGY_MAX; n++) {
      const radio = el("input", { type: "radio", name: "reflect-energy", value: String(n), class: "reflect-energy__radio", "data-reflect-energy": String(n) }) as HTMLInputElement;
      radio.addEventListener("change", () => {
        if (radio.checked) todayStore.save({ energy: n });
      });
      live!.energy.push({ radio, n });
      options.push(el("label", { class: "reflect-energy__option" }, [radio, el("span", { class: "reflect-energy__number" }, [String(n)])]));
    }
    return question("reflect-q2", re.title, re.hint, el("div", { class: "reflect-energy", role: "radiogroup", "aria-labelledby": "reflect-q2" }, options));
  }

  // ---------------- Question 3: What do I change tomorrow? ----------------

  function buildChangeQuestion(): HTMLElement {
    const rc = t().reflect.change;
    const input = el("textarea", {
      id: "reflect-change",
      class: "reflect-input",
      rows: "3",
      maxlength: String(CHANGE_MAX_LENGTH),
      placeholder: rc.placeholder,
      dir: "auto",
      "aria-describedby": "reflect-change-note",
      "data-reflect-change": "",
    }) as HTMLTextAreaElement;
    input.value = draftGet<string>(CHANGE_DRAFT) ?? entry().change_for_tomorrow ?? "";
    input.addEventListener("input", () => draftSet(CHANGE_DRAFT, input.value));
    // "change" fires when the field is left; that is the save (the same rule as the Highlight on Today).
    input.addEventListener("change", () => {
      const text = cleanText(input.value);
      draftClear(CHANGE_DRAFT);
      input.value = text ?? "";
      if (text !== entry().change_for_tomorrow) todayStore.save({ change_for_tomorrow: text });
    });
    live!.change = input;
    return question("reflect-q3", rc.title, rc.hint, input, el("p", { id: "reflect-change-note", class: "reflect-field__hint" }, [rc.autosave]));
  }

  // ---------------- Saving status ----------------

  function syncStatus(s: TodayState) {
    if (!live) return;
    const rs = t().reflect.status;
    if (s.saveError) {
      const retry = el("button", { class: "btn-secondary", type: "button", "data-reflect-retry": "" }, [rs.retry]);
      retry.addEventListener("click", () => todayStore.retry());
      live.status.replaceChildren(errorBanner(`${rs.notSaved} ${errorMessage(s.saveError)}`), retry);
    } else if (s.saving) {
      live.status.replaceChildren(el("span", { "data-reflect-saving": "" }, [rs.saving]));
    } else if (s.saved) {
      live.status.replaceChildren(el("span", { "data-reflect-saved": "" }, [rs.saved]));
    } else {
      live.status.replaceChildren();
    }
  }

  /** Puts the store's values into the controls without rebuilding anything. */
  function sync() {
    if (!live) return;
    const s = todayStore.get();
    if (!s.entry) return;
    const e = s.entry;
    if (!!e.highlight !== live.withHighlight) {
      draw(); // the Highlight appeared or went away: question 1 has another shape
      return;
    }
    if (!!e.tactic !== live.withTactic) {
      draw(); // Coach saved (or replaced) a tactic: the extra question appears
      return;
    }
    if (live.done) live.done.checked = e.highlight_done;
    for (const { radio, value } of live.applied) radio.checked = e.tactic_applied === value;
    for (const { radio, n } of live.energy) radio.checked = e.energy === n;
    // The field being typed in is never overwritten.
    if (document.activeElement !== live.change) live.change.value = draftGet<string>(CHANGE_DRAFT) ?? e.change_for_tomorrow ?? "";
    syncStatus(s);
    drawRecent();
  }

  // ---------------- Last 7 days ----------------

  function recentRow(day: RecentDay): HTMLElement {
    const rr = t().reflect.recent;
    const result = day.highlight_done === true ? "yes" : day.highlight_done === false ? "no" : "none";
    const text = result === "yes" ? rr.yes : result === "no" ? rr.no : rr.noHighlight;
    const label = day.date === localDay() ? rr.today : formatDay(day.date, "short");
    return el("li", { class: "reflect-recent__row", "data-reflect-day": day.date }, [
      el("time", { class: "reflect-recent__date", datetime: day.date }, [label]),
      el("span", { class: `reflect-recent__result reflect-recent__result--${result}`, "data-result": result }, [text]),
    ]);
  }

  function drawRecent() {
    const rr = t().reflect.recent;
    const s: RecentState = recentStore.get();
    const panel = asyncPanel({
      id: "reflect-recent",
      status: s.status,
      error: s.error,
      onRetry: () => recentStore.load({ force: true }),
      skeleton: "list",
      rows: 7,
      label: rr.title,
      render: () => el("ul", { class: "reflect-recent__list" }, newestFirst(withToday(s.days, todayStore.get().entry)).map(recentRow)),
    });
    recentBox.replaceChildren(
      el("section", { class: "card reflect-recent", "aria-labelledby": "reflect-recent-title" }, [
        el("h2", { id: "reflect-recent-title", class: "reflect-question__title" }, [rr.title]),
        el("p", { class: "reflect-question__hint" }, [rr.hint]),
        panel,
      ])
    );
  }

  // ---------------- Layout ----------------

  function buildReady(): HTMLElement {
    const e = entry();
    live = {
      withHighlight: !!e.highlight,
      done: null,
      energy: [],
      applied: [],
      withTactic: !!e.tactic,
      change: null as unknown as HTMLTextAreaElement,
      status: el("div", { class: "reflect-status", role: "status", "aria-live": "polite", "data-reflect-status": "" }),
    };
    const q1 = buildHighlightQuestion(e);
    const qTactic = buildTacticQuestion(e);
    const q2 = buildEnergyQuestion();
    const q3 = buildChangeQuestion();
    const wrapper = el("div", { class: "reflect" }, [
      el("p", { class: "reflect-date" }, [el("time", { datetime: e.date }, [formatDay(e.date, "long")])]),
      el("p", { class: "reflect-intro" }, [t().reflect.intro]),
      q1,
      ...(qTactic ? [qTactic] : []),
      q2,
      q3,
      live.status,
    ]);
    sync();
    return wrapper;
  }

  function draw() {
    live = null;
    const s = todayStore.get();
    const panel = asyncPanel({
      id: "reflect",
      status: s.status,
      error: s.error,
      onRetry: () => todayStore.load({ force: true }),
      skeleton: "list",
      rows: 3,
      label: t().growth.routes.reflect.label,
      render: buildReady,
    });
    drawRecent();
    // The title (h1) comes from views/section-view.ts.
    container.replaceChildren(el("div", { class: "reflect-page" }, [panel, recentBox]));
  }

  // Only a change of what is shown redraws; an answer only syncs the controls.
  let last: TodayState = todayStore.get();
  const onTodayChange = (next: TodayState) => {
    const previous = last;
    last = next;
    if (!container.isConnected) {
      dispose(); // replaced by a newer render or left the screen
      return;
    }
    if (previous.status !== next.status || previous.error !== next.error) draw();
    else sync();
  };
  const onRecentChange = () => {
    if (!container.isConnected) {
      dispose();
      return;
    }
    drawRecent();
  };
  const unsubscribeToday = todayStore.subscribe(onTodayChange);
  const unsubscribeRecent = recentStore.subscribe(onRecentChange);
  const dispose = () => {
    unsubscribeToday();
    unsubscribeRecent();
    if (disposeActive === dispose) disposeActive = null;
  };
  disposeActive = dispose;

  draw();
  return container;
}
