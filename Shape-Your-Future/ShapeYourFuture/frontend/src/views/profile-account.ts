import { apiClient } from "../api/client";
import type { ProfileOut } from "../api/types";
import { handleAuthExpiry } from "../lib/auth-guard";
import { el, errorMessage, isApiError } from "../lib/dom";
import { confirmLogout } from "../lib/logout";
import { errorBanner } from "../lib/page";
import { checklist, isStrongPassword, passwordField, passwordRules } from "../lib/password-ui";
import { LANG_META, LANG_ORDER } from "../lib/locales";
import { getState, setLang, setTheme, t } from "../lib/theme-i18n";
import type { Theme } from "../lib/theme-i18n";
import { asyncPanel, clearFieldDraft, formField, submitLock } from "../lib/ui";
import { draftClear, draftGet, draftSet } from "../lib/ui/drafts";
import type { SubmitResult } from "../lib/ui";
import { profileStore } from "../state/profile";
import type { ProfileStatus } from "../state/profile";

/**
 * Profile: language, theme, account (display name, password) and log out. Nothing else.
 *
 * app.ts rebuilds this view on every language / theme change, so nothing typed
 * may live only in the DOM: text fields use formField (draft store), the
 * avatar choice and the three password fields write to the same draft store,
 * and a request that is still running is re-bound by submitLock. The profile
 * itself comes from `profileStore` and is not fetched again on a re-render.
 * All drafts are dropped after a successful save, and on logout.
 */

const NAME_MAX = 50;

const PW_KEYS = { current: "profile:pw-current", next: "profile:pw-new", confirm: "profile:pw-confirm" } as const;

let disposeActive: (() => void) | null = null;

export function renderProfileAccount(): HTMLElement {
  disposeActive?.();

  const root = el("div", { class: "profile" });
  const body = el("div", { class: "profile__body" });
  root.append(body);

  let shownStatus: ProfileStatus | null = null;
  const paint = () => {
    const s = profileStore.get();
    // Rebuild only when the load state changes. A save updates the store too,
    // but the forms update themselves in place (focus and typing stay put).
    if (s.status === shownStatus) return;
    shownStatus = s.status;
    body.replaceChildren(
      asyncPanel({
        id: "profile-load",
        status: s.status === "idle" ? "loading" : s.status,
        error: s.error,
        skeleton: "card",
        label: t().growth.profile.loading,
        onRetry: () => profileStore.load(true),
        render: () => (s.profile ? buildSections(s.profile) : el("div")),
      })
    );
  };

  // The store emits synchronously from load() below, before app.ts has put
  // `root` on the page, so "not connected" only means "navigated away" once
  // the view has been connected at least once.
  let wasConnected = false;
  const stop = profileStore.subscribe(() => {
    if (root.isConnected) wasConnected = true;
    else if (wasConnected) return stop(); // navigated away
    paint();
  });
  disposeActive = stop;

  paint();
  void profileStore.load();
  return root;
}

function buildSections(initial: ProfileOut): HTMLElement {
  const g = t().growth.profile;
  return el("div", { class: "profile__sections" }, [
    preferencesPanel(),
    identityPanel(initial),
    passwordPanel(),
    el("section", { class: "panel profile__panel", "aria-labelledby": "profile-session-title" }, [
      el("h2", { class: "panel__title", id: "profile-session-title" }, [g.session.title]),
      el("p", { class: "field-hint" }, [g.session.hint]),
      logoutButton(),
    ]),
  ]);
}

// ---------------- Preferences: language + theme ----------------

/** Two small radio groups. A change applies at once (app.ts re-renders, drafts survive) and nothing goes to the server. */
function preferencesPanel(): HTMLElement {
  const g = t().growth.profile.preferences;
  const state = getState();

  const group = (name: string, legend: string, options: { value: string; label: string; lang?: string }[], current: string, onPick: (v: string) => void) =>
    el("fieldset", { class: "profile__choice" }, [
      el("legend", { class: "field-label" }, [legend]),
      el(
        "div",
        { class: "profile__choice-row" },
        options.map((o) => {
          const input = el("input", { type: "radio", name, value: o.value, class: "profile__choice-input" }) as HTMLInputElement;
          input.checked = o.value === current;
          input.addEventListener("change", () => onPick(o.value));
          return el("label", { class: "profile__choice-item", ...(o.lang ? { lang: o.lang } : {}) }, [input, el("span", {}, [o.label])]);
        })
      ),
    ]);

  return el("section", { class: "panel profile__panel", "aria-labelledby": "profile-prefs-title" }, [
    el("h2", { class: "panel__title", id: "profile-prefs-title" }, [g.title]),
    group(
      "profile-lang",
      g.language,
      LANG_ORDER.map((code) => ({ value: code, label: LANG_META[code].nativeName, lang: code })),
      state.lang,
      (v) => setLang(v as typeof state.lang)
    ),
    group(
      "profile-theme",
      g.theme,
      [
        { value: "light", label: g.themeLight },
        { value: "dark", label: g.themeDark },
      ],
      state.theme,
      (v) => setTheme(v as Theme)
    ),
  ]);
}

function logoutButton(): HTMLElement {
  const btn = el("button", { class: "btn-secondary profile__logout", type: "button", "data-focus-key": "profile-logout" }, [t().growth.profile.session.logout]);
  btn.addEventListener("click", () => void confirmLogout(btn));
  return btn;
}

// ---------------- Profile: display name ----------------

function identityPanel(profile: ProfileOut): HTMLElement {
  const g = t().growth.profile;
  const name = formField({
    id: "profile-display-name",
    label: g.identity.displayName,
    hint: g.identity.displayNameHint,
    value: profile.display_name,
    maxLength: NAME_MAX,
    autocomplete: "nickname",
  });

  const saveBtn = el("button", { class: "btn-primary", type: "submit" }, [g.identity.save]) as HTMLButtonElement;
  const rateStatus = el("p", { class: "field-hint" });
  const okSlot = el("p", { class: "profile__ok", role: "status", "aria-live": "polite" });
  const errorSlot = el("div", { class: "form-slot" });

  const lock = submitLock("profile-save", {
    buttons: [saveBtn],
    primary: saveBtn,
    idleLabel: g.identity.save,
    busyLabel: g.identity.saving,
    status: rateStatus,
    onSettled: (result: SubmitResult<unknown>) => {
      if (result.status === "ok") {
        const saved = result.value as ProfileOut;
        profileStore.update(saved);
        clearFieldDraft("profile-display-name");
        name.setValue(saved.display_name);
        errorSlot.replaceChildren();
        okSlot.textContent = g.identity.saved;
      } else if (result.status === "error") {
        if (handleAuthExpiry(result.error)) return;
        okSlot.textContent = "";
        errorSlot.replaceChildren(errorBanner(errorMessage(result.error)));
      }
    },
  });

  const form = el("form", { class: "profile__form", novalidate: "true" }, [
    el("div", { class: "field" }, [el("label", { for: "profile-username" }, [g.identity.username]), readonlyValue("profile-username", profile.username)]),
    name.node,
    errorSlot,
    okSlot,
    rateStatus,
    saveBtn,
  ]) as HTMLFormElement;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    okSlot.textContent = "";
    const displayName = name.getValue().trim();
    if (displayName.length > NAME_MAX) return name.setError(g.identity.nameTooLong), name.focus();
    void lock.run(() =>
      apiClient.updateProfile({
        // The server shows the username when display_name is empty, so an
        // unchanged fallback is sent as "no display name" rather than copied.
        display_name: displayName === "" || displayName === profile.username ? null : displayName,
        bio: profile.bio, // not editable here; passed through so a save never clears it
      })
    );
  });

  return el("section", { class: "panel profile__panel", "aria-labelledby": "profile-identity-title" }, [
    el("h2", { class: "panel__title", id: "profile-identity-title" }, [g.identity.title]),
    form,
  ]);
}

/** Read-only text that looks like the other fields (username cannot change). */
function readonlyValue(id: string, value: string): HTMLInputElement {
  const input = el("input", { type: "text", id, readonly: "true", dir: "ltr" }) as HTMLInputElement;
  input.value = value;
  return input;
}

// ---------------- Password change ----------------

function passwordPanel(): HTMLElement {
  const g = t().growth.profile;
  const a = t().auth;

  const current = passwordField("profile-pw-current", g.password.current, "current-password", draftGet<string>(PW_KEYS.current) ?? "");
  const next = passwordField("profile-pw-new", g.password.new, "new-password", draftGet<string>(PW_KEYS.next) ?? "");
  const confirm = passwordField("profile-pw-confirm", g.password.confirm, "new-password", draftGet<string>(PW_KEYS.confirm) ?? "");
  for (const f of [current, next, confirm]) f.input.dir = "ltr";

  const hints = checklist("profile-pw-hints", a.passwordChecklist, passwordRules());
  const matchMsg = el("div", { class: "match-msg", id: "profile-pw-match", role: "status", "aria-live": "polite" });
  next.input.setAttribute("aria-describedby", "profile-pw-hints");
  confirm.input.setAttribute("aria-describedby", "profile-pw-match");

  const submitBtn = el("button", { class: "btn-primary", type: "submit" }, [g.password.submit]) as HTMLButtonElement;
  const rateStatus = el("p", { class: "field-hint" });
  const okSlot = el("p", { class: "profile__ok", role: "status", "aria-live": "polite" });
  const errorSlot = el("div", { class: "form-slot" });
  let locked = false;

  /** Text/classes only, never rebuilds the DOM: typing keeps its focus. */
  function refresh() {
    const pwOk = hints.update(next.input.value);
    const hasConfirm = confirm.input.value.length > 0;
    const match = hasConfirm && confirm.input.value === next.input.value;
    matchMsg.textContent = hasConfirm ? (match ? a.matchOk : a.matchBad) : "";
    matchMsg.className = `match-msg${hasConfirm ? (match ? " match-msg--ok" : " match-msg--bad") : ""}`;
    submitBtn.disabled = locked || !(current.input.value.length > 0 && pwOk && match);
  }

  const keyOf = new Map<HTMLInputElement, string>([
    [current.input, PW_KEYS.current],
    [next.input, PW_KEYS.next],
    [confirm.input, PW_KEYS.confirm],
  ]);
  for (const [input, key] of keyOf) {
    const onEdit = () => {
      draftSet(key, input.value);
      okSlot.textContent = "";
      refresh();
    };
    input.addEventListener("input", onEdit);
    input.addEventListener("change", onEdit); // autofill
  }

  const lock = submitLock("profile-password", {
    buttons: [submitBtn],
    primary: submitBtn,
    idleLabel: g.password.submit,
    busyLabel: g.password.submitting,
    status: rateStatus,
    onChange: (l) => {
      locked = l;
      refresh();
    },
    onSettled: (result: SubmitResult<unknown>) => {
      if (result.status === "ok") {
        // 204: nothing to read. The token stays valid (stateless JWT), so the
        // user stays signed in; only the typed passwords are dropped.
        for (const key of keyOf.values()) draftClear(key);
        for (const input of keyOf.keys()) input.value = "";
        errorSlot.replaceChildren();
        okSlot.textContent = g.password.changed;
        refresh();
      } else if (result.status === "error") {
        if (handleAuthExpiry(result.error)) return;
        okSlot.textContent = "";
        // The backend answers 400 only for a wrong current password (the new
        // one is checked here first); its text is Persian, so use our own.
        const wrongCurrent = isApiError(result.error) && result.error.status === 400;
        errorSlot.replaceChildren(errorBanner(wrongCurrent ? g.password.wrongCurrent : errorMessage(result.error)));
        if (wrongCurrent) current.input.focus();
      }
    },
  });

  const form = el("form", { class: "profile__form", novalidate: "true" }, [
    current.node,
    next.node,
    hints.node,
    confirm.node,
    matchMsg,
    errorSlot,
    okSlot,
    rateStatus,
    submitBtn,
  ]) as HTMLFormElement;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;
    const currentPassword = current.input.value;
    const newPassword = next.input.value;
    if (!isStrongPassword(newPassword) || confirm.input.value !== newPassword) return;
    okSlot.textContent = "";
    errorSlot.replaceChildren();
    void lock.run(() => apiClient.changePassword({ current_password: currentPassword, new_password: newPassword }));
  });

  refresh();
  return el("section", { class: "panel profile__panel", "aria-labelledby": "profile-password-title" }, [
    el("h2", { class: "panel__title", id: "profile-password-title" }, [g.password.title]),
    form,
  ]);
}
