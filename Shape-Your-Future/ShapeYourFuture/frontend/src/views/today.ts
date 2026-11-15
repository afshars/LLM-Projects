import { ENERGIZE_KEYS, HIGHLIGHT_MAX_LENGTH, LASER_KEYS } from "../api/types";
import type { CoachTactic, DailyEntry, DailyEntryPatch } from "../api/types";
import { el, errorMessage } from "../lib/dom";
import { errorBanner } from "../lib/page";
import { getLang, getLocale, t } from "../lib/theme-i18n";
import { asyncPanel } from "../lib/ui";
import { draftClear, draftGet, draftSet } from "../lib/ui/drafts";
import { journey } from "../state/journey";
import { DEFAULT_TIMER_MINUTES, TIMER_MINUTES, focusTimerStore, formatRemaining } from "../state/focus-timer";
import type { TimerView } from "../state/focus-timer";
import { cleanText, todayStore } from "../state/today";
import type { TodayState } from "../state/today";

/** Unsubscribes the previously mounted instance (app.ts rebuilds this from scratch on a language change). */
let disposeActive: (() => void) | null = null;

/** The Highlight field mirrors what is typed here, so a language change (which rebuilds the view) keeps it. */
const HIGHLIGHT_DRAFT = "today:highlight";

/** The length chosen in the timer's select; kept across rebuilds of the view. */
let selectedMinutes: number = DEFAULT_TIMER_MINUTES;

/** "Monday, 9 November" in the UI language; the raw ISO day if it cannot be read. */
function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y ?? NaN, (m ?? NaN) - 1, d ?? NaN);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(getLocale(), { weekday: "long", month: "long", day: "numeric" });
}

function section(id: string, title: string, hint: string, ...body: Node[]): HTMLElement {
  return el("section", { class: "card today-section", "aria-labelledby": id }, [
    el("h2", { id, class: "today-section__title" }, [title]),
    el("p", { class: "today-section__hint" }, [hint]),
    ...body,
  ]);
}

/**
 * The Today screen: Highlight (one priority, optional time), Laser (three distraction defaults + an optional focus
 * timer) and Energize (four checks). Everything saves by itself (state/today.ts), so the whole screen takes well
 * under a minute and has no Save button. No points, no streaks, no totals.
 *
 * The store keeps the data: building this view asks it to load, and it fetches only on the first visit, after
 * "Try again", or on a new calendar day. A change in the store updates the controls IN PLACE (sync()) so a tap never
 * rebuilds the page or steals focus; only a change of load status (loading -> ready / error) redraws.
 */
export function renderToday(): HTMLElement {
  disposeActive?.();
  const container = el("div", {});

  // Before subscribing: the synchronous "loading" it sets must not reach this (not yet mounted) instance.
  void todayStore.load();

  /** The parts of the ready layout that change without a rebuild. Null while the panel shows something else. */
  let live: {
    highlight: HTMLInputElement;
    schedule: HTMLInputElement;
    scheduleHint: HTMLElement;
    status: HTMLElement;
    checks: Array<{ box: HTMLInputElement; group: "laser" | "energize"; key: string }>;
    timer: HTMLElement;
    tactic: HTMLElement;
  } | null = null;
  let timerPhase: TimerView["phase"] = "idle";

  const entry = (): DailyEntry => todayStore.get().entry!;

  // ---------------- Highlight ----------------

  function buildHighlight(): HTMLElement {
    const td = t().today;
    const input = el("input", {
      type: "text",
      id: "today-highlight",
      class: "today-input",
      maxlength: String(HIGHLIGHT_MAX_LENGTH),
      placeholder: td.highlight.placeholder,
      autocomplete: "off",
      dir: "auto",
      "aria-describedby": "today-highlight-note",
      "data-today-highlight": "",
    }) as HTMLInputElement;
    input.value = draftGet<string>(HIGHLIGHT_DRAFT) ?? entry().highlight ?? "";
    input.addEventListener("input", () => draftSet(HIGHLIGHT_DRAFT, input.value));

    const commit = () => {
      const text = cleanText(input.value);
      draftClear(HIGHLIGHT_DRAFT);
      input.value = text ?? "";
      if (text !== entry().highlight) todayStore.save({ highlight: text });
    };
    input.addEventListener("change", commit);

    const schedule = el("input", {
      type: "time",
      id: "today-schedule",
      class: "today-input today-input--time",
      dir: "ltr", // a clock time reads left to right in Persian too
      "aria-describedby": "today-schedule-hint",
      "data-today-schedule": "",
    }) as HTMLInputElement;
    schedule.addEventListener("change", () => todayStore.save({ scheduled_time: schedule.value === "" ? null : schedule.value }));
    const scheduleHint = el("p", { id: "today-schedule-hint", class: "today-field__hint" });

    const form = el("form", { class: "today-highlight", novalidate: "" }, [
      el("label", { class: "today-field__label", for: "today-highlight" }, [td.highlight.label]),
      input,
      el("p", { id: "today-highlight-note", class: "today-field__hint" }, [td.highlight.autosave]),
      el("label", { class: "today-field__label", for: "today-schedule" }, [td.highlight.scheduleLabel]),
      schedule,
      scheduleHint,
    ]);
    // Enter: save and leave the field (the "change" event does the saving; this keeps the page from submitting).
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      commit();
      input.blur();
    });

    live!.highlight = input;
    live!.schedule = schedule;
    live!.scheduleHint = scheduleHint;
    return section("today-highlight-title", td.highlight.title, td.highlight.hint, form);
  }

  // ---------------- Today's tactic (chosen in Coach) ----------------

  /** Read only: the tactic is saved by Coach after the user accepted it; this screen only shows it. */
  function drawTactic() {
    if (!live) return;
    const td = t().today.tactic;
    const tactic: CoachTactic | null = entry().tactic;
    if (!tactic) {
      const go = el("button", { class: "btn-secondary", type: "button", "data-today-go-coach": "" }, [td.goCoach]);
      go.addEventListener("click", () => journey.goTo("COACH"));
      live.tactic.replaceChildren(el("p", { class: "today-field__hint", "data-today-tactic-none": "" }, [td.none]), el("div", {}, [go]));
      return;
    }
    const fa = getLang() === "fa";
    live.tactic.replaceChildren(
      el("div", { class: "today-tactic", "data-today-tactic": String(tactic.id) }, [
        el("h3", { class: "today-tactic__name", dir: "auto" }, [fa ? tactic.title_fa : tactic.title_en]),
        el("p", { class: "today-tactic__desc", dir: "auto" }, [fa ? tactic.description_fa : tactic.description_en]),
      ])
    );
  }

  // ---------------- Checks (Laser, Energize) ----------------

  function buildChecks(group: "laser" | "energize", keys: readonly string[], labels: Record<string, string>): HTMLElement {
    const items = keys.map((key) => {
      const box = el("input", { type: "checkbox", class: "today-check__box", "data-today-check": `${group}.${key}` }) as HTMLInputElement;
      box.addEventListener("change", () => {
        const patch = { [group]: { [key]: box.checked } } as DailyEntryPatch;
        todayStore.save(patch);
      });
      live!.checks.push({ box, group, key });
      return el("li", { class: "today-check" }, [el("label", { class: "today-check__label" }, [box, el("span", {}, [labels[key] ?? key])])]);
    });
    return el("ul", { class: "today-checks" }, items);
  }

  // ---------------- Focus timer (optional, inside Laser) ----------------

  function drawTimer() {
    if (!live) return;
    const td = t().today;
    const view = focusTimerStore.view();
    timerPhase = view.phase;

    const heading = el("h3", { class: "today-timer__title" }, [td.timer.title, " ", el("span", { class: "today-timer__optional" }, [`(${td.timer.optional})`])]);
    const body: Node[] = [heading];

    if (view.phase === "idle") {
      const select = el("select", { id: "today-timer-minutes", class: "today-input today-input--select", "data-today-timer-minutes": "" }) as HTMLSelectElement;
      for (const minutes of TIMER_MINUTES) {
        const option = el("option", { value: String(minutes) }, [td.timer.minutes(minutes)]) as HTMLOptionElement;
        option.selected = minutes === selectedMinutes;
        select.append(option);
      }
      select.addEventListener("change", () => {
        selectedMinutes = Number(select.value);
      });
      const start = el("button", { class: "btn-secondary", type: "button", "data-today-timer-start": "" }, [td.timer.start]);
      start.addEventListener("click", () => focusTimerStore.start(selectedMinutes));
      body.push(
        el("p", { class: "today-field__hint" }, [td.timer.hint]),
        el("div", { class: "today-timer__row" }, [el("label", { class: "today-field__label", for: "today-timer-minutes" }, [td.timer.lengthLabel]), select, start])
      );
    } else {
      const running = view.phase === "running";
      // Same status chip as the focus session screen. Only its text is announced; the countdown itself is silent.
      const chip = el("div", { class: `focus-status ${running ? "focus-status--running" : "focus-status--done"}`, role: "status", "data-today-timer-status": view.phase }, [
        el("span", { class: "focus-status__dot", "aria-hidden": "true" }),
        el("strong", {}, [running ? td.timer.running : td.timer.finished]),
      ]);
      body.push(chip);
      if (view.phase === "running") {
        body.push(
          el("p", { class: "today-timer__clock" }, [
            el("span", { class: "today-timer__clock-label" }, [td.timer.remaining]),
            " ",
            el("time", { class: "today-timer__time", dir: "ltr", "data-today-timer-time": "" }, [formatRemaining(view.remainingMs)]),
          ])
        );
      }
      body.push(el("p", { class: "focus-help" }, [running ? td.timer.runningHelp : td.timer.finishedHelp]));
      const button = el("button", { class: running ? "btn-secondary" : "btn-primary", type: "button", "data-today-timer-clear": "" }, [running ? td.timer.stop : td.timer.done]);
      button.addEventListener("click", () => focusTimerStore.clear());
      body.push(el("div", { class: "focus-actions" }, [button]));
    }
    live.timer.replaceChildren(...body);
  }

  /** Once a second while the screen is up: only the visible countdown changes. */
  function tick() {
    if (!live) return;
    const view = focusTimerStore.view();
    if (view.phase === "running") {
      const time = live.timer.querySelector("[data-today-timer-time]");
      if (time) time.textContent = formatRemaining(view.remainingMs);
    } else if (view.phase !== timerPhase) {
      drawTimer(); // the countdown reached zero
    }
  }

  // ---------------- Saving status ----------------

  function syncStatus(s: TodayState) {
    if (!live) return;
    const td = t().today;
    if (s.saveError) {
      const retry = el("button", { class: "btn-secondary", type: "button", "data-today-retry": "" }, [td.status.retry]);
      retry.addEventListener("click", () => todayStore.retry());
      live.status.replaceChildren(errorBanner(`${td.status.notSaved} ${errorMessage(s.saveError)}`), retry);
    } else if (s.saving) {
      live.status.replaceChildren(el("span", { "data-today-saving": "" }, [td.status.saving]));
    } else if (s.saved) {
      live.status.replaceChildren(el("span", { "data-today-saved": "" }, [td.status.saved]));
    } else {
      live.status.replaceChildren();
    }
  }

  /** Puts the store's values into the controls without rebuilding anything. */
  function sync() {
    if (!live) return;
    const s = todayStore.get();
    if (!s.entry) return;
    const td = t().today;
    const e = s.entry;
    for (const { box, group, key } of live.checks) {
      box.checked = (e[group] as Record<string, boolean>)[key] ?? false;
    }
    // The field being typed in is never overwritten.
    if (document.activeElement !== live.highlight) live.highlight.value = draftGet<string>(HIGHLIGHT_DRAFT) ?? e.highlight ?? "";
    live.schedule.disabled = !e.highlight;
    if (document.activeElement !== live.schedule) live.schedule.value = e.scheduled_time ?? "";
    live.scheduleHint.textContent = e.highlight ? td.highlight.scheduleHint : td.highlight.scheduleNeedsHighlight;
    drawTactic();
    syncStatus(s);
  }

  // ---------------- Layout ----------------

  function buildReady(): HTMLElement {
    const td = t().today;
    live = {
      highlight: null as unknown as HTMLInputElement,
      schedule: null as unknown as HTMLInputElement,
      scheduleHint: null as unknown as HTMLElement,
      status: el("div", { class: "today-status", role: "status", "aria-live": "polite", "data-today-status": "" }),
      checks: [],
      timer: el("div", { class: "today-timer", "data-today-timer": "" }),
      tactic: el("div", { class: "today-tactic-box" }),
    };
    const highlight = buildHighlight();
    const laser = section("today-laser-title", td.laser.title, td.laser.hint, buildChecks("laser", LASER_KEYS, td.laser.checks), live.timer);
    const energize = section("today-energize-title", td.energize.title, td.energize.hint, buildChecks("energize", ENERGIZE_KEYS, td.energize.checks));
    const tactic = section("today-tactic-title", td.tactic.title, td.tactic.hint, live.tactic);
    const date = entry().date;
    const wrapper = el("div", { class: "today" }, [
      el("p", { class: "today-date" }, [el("time", { datetime: date }, [formatDay(date)])]),
      el("p", { class: "today-intro" }, [td.intro]),
      highlight,
      tactic,
      laser,
      energize,
      live.status,
    ]);
    drawTimer();
    sync();
    return wrapper;
  }

  function draw() {
    live = null;
    const td = t().today;
    const s = todayStore.get();
    const panel = asyncPanel({
      id: "today",
      status: s.status,
      error: s.error,
      onRetry: () => todayStore.load({ force: true }),
      skeleton: "list",
      rows: 3,
      label: td.title,
      render: buildReady,
    });
    // Not page(): that adds the step indicator of the retired setup wizard (Context / Goal / Breakdown ...).
    container.replaceChildren(el("div", { class: "page" }, [el("h1", { class: "page-title" }, [td.title]), panel]));
  }

  // Only a change of what is shown redraws; a tap on a check only syncs the controls.
  let last: TodayState = todayStore.get();
  const onChange = (next: TodayState) => {
    const previous = last;
    last = next;
    if (!container.isConnected) {
      dispose(); // replaced by a newer render or left the screen
      return;
    }
    if (previous.status !== next.status || previous.error !== next.error) draw();
    else sync();
  };
  const unsubscribe = todayStore.subscribe(onChange);
  const unsubscribeTimer = focusTimerStore.subscribe(() => {
    if (!container.isConnected) {
      dispose();
      return;
    }
    drawTimer();
  });
  const interval = setInterval(() => {
    if (!container.isConnected) {
      dispose();
      return;
    }
    tick();
  }, 1000);
  const dispose = () => {
    unsubscribe();
    unsubscribeTimer();
    clearInterval(interval);
    if (disposeActive === dispose) disposeActive = null;
  };
  disposeActive = dispose;

  draw();
  return container;
}
