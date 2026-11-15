import { apiClient } from "../api/client";
import { authStorage } from "../api/auth-storage";
import { el, errorMessage } from "../lib/dom";
import { errorBanner, page, setButtonLoading } from "../lib/page";
import { checklist, passwordField, passwordRules } from "../lib/password-ui";
import type { Rule } from "../lib/password-ui";
import { t } from "../lib/theme-i18n";
import { journey } from "../state/journey";

type Mode = "login" | "register";

/** In-memory only (never persisted). Survives language/theme re-renders
 * of this view so a half-typed form is not lost when the user toggles. */
const draft = { mode: "login" as Mode, username: "", password: "", confirm: "" };

// ---------------- Rules (mirror backend: app/core/security.py + routes/auth.py) ----------------

const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_.]{2,29}$/;

function usernameRules(): Rule[] {
  const a = t().auth;
  return [
    { label: a.ruleUserStart, test: (v) => /^[A-Za-z]/.test(v) },
    { label: a.ruleUserLength, test: (v) => v.length >= 3 && v.length <= 30 },
    { label: a.ruleUserChars, test: (v) => v.length > 0 && /^[A-Za-z0-9_.]+$/.test(v) },
  ];
}

// ---------------- View ----------------

export function renderAuth(): HTMLElement {
  const a = t().auth;
  const container = el("div", {});
  const isRegister = draft.mode === "register";
  const idleLabel = isRegister ? a.register : a.login;

  // Glassmorphism helper card
  const helper = el("aside", { class: "helper-card" }, [
    el("div", { class: "helper-icon", "aria-hidden": "true" }, ["✦"]),
    el("div", {}, [
      el("strong", {}, [isRegister ? a.helperRegisterTitle : a.helperLoginTitle]),
      el("p", {}, [isRegister ? a.helperRegister : a.helperLogin]),
    ]),
  ]);

  const usernameInput = el("input", {
    type: "text",
    id: "username",
    autocomplete: "username",
    required: "true",
    autocapitalize: "none",
    spellcheck: "false",
    dir: "ltr",
  }) as HTMLInputElement;
  usernameInput.value = draft.username;

  const pw = passwordField("password", a.password, isRegister ? "new-password" : "current-password", draft.password);
  pw.input.dir = "ltr";
  const confirm = isRegister ? passwordField("confirm-password", a.confirmPassword, "new-password", draft.confirm) : null;
  if (confirm) confirm.input.dir = "ltr";

  const userHints = isRegister ? checklist("username-hints", a.usernameChecklist, usernameRules()) : null;
  const pwHints = isRegister ? checklist("password-hints", a.passwordChecklist, passwordRules()) : null;
  const matchMsg = el("div", { class: "match-msg", id: "confirm-msg", role: "status", "aria-live": "polite" });
  if (isRegister) {
    usernameInput.setAttribute("aria-describedby", "username-hints");
    pw.input.setAttribute("aria-describedby", "password-hints");
    confirm?.input.setAttribute("aria-describedby", "confirm-msg");
  }

  // The banner inside already has role="alert"; a second live wrapper would announce it twice.
  const errorSlot = el("div", { class: "form-slot" });
  const submitBtn = el("button", { class: "btn-primary btn-block", type: "submit" }, [idleLabel]) as HTMLButtonElement;

  let busy = false;

  /** Recomputes hints + submit availability. Touches only text/classes,
   * never rebuilds the DOM, so typing never loses focus. */
  function refresh() {
    let valid = draft.username.length > 0 && draft.password.length > 0;
    if (isRegister && userHints && pwHints && confirm) {
      const uOk = userHints.update(draft.username) && USERNAME_RE.test(draft.username);
      const pOk = pwHints.update(draft.password);
      const hasConfirm = draft.confirm.length > 0;
      const match = hasConfirm && draft.confirm === draft.password;
      matchMsg.textContent = hasConfirm ? (match ? a.matchOk : a.matchBad) : "";
      matchMsg.className = `match-msg${hasConfirm ? (match ? " match-msg--ok" : " match-msg--bad") : ""}`;
      valid = uOk && pOk && match;
    }
    if (!busy) submitBtn.disabled = !valid;
  }

  const readInputs = () => {
    draft.username = usernameInput.value.trim();
    draft.password = pw.input.value;
    if (confirm) draft.confirm = confirm.input.value;
    refresh();
  };
  for (const field of [usernameInput, pw.input, ...(confirm ? [confirm.input] : [])]) {
    field.addEventListener("input", readInputs);
    field.addEventListener("change", readInputs); // autofill
  }

  const form = el("form", { class: "auth-form", novalidate: "true" }, [
    el("div", { class: "field" }, [el("label", { for: "username" }, [a.username]), usernameInput]),
    ...(userHints ? [userHints.node] : []),
    pw.node,
    ...(pwHints ? [pwHints.node] : []),
    ...(confirm ? [confirm.node, matchMsg] : []),
    errorSlot,
    submitBtn,
  ]) as HTMLFormElement;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy || submitBtn.disabled) return;
    errorSlot.replaceChildren();
    const username = draft.username;
    const password = draft.password;

    busy = true;
    setButtonLoading(submitBtn, true, idleLabel, a.wait);
    try {
      // Same API calls/payloads as before - confirm password is UI-only.
      const token = isRegister
        ? await apiClient.register(username, password)
        : await apiClient.login(username, password);
      authStorage.setToken(token.access_token);
      draft.password = "";
      draft.confirm = "";
      journey.goTo("COACH");
    } catch (err) {
      // Update only the error slot: inputs, focus and hints stay intact.
      errorSlot.replaceChildren(errorBanner(errorMessage(err, isRegister ? "register" : "login")));
    } finally {
      busy = false;
      setButtonLoading(submitBtn, false, idleLabel, a.wait);
      refresh();
    }
  });

  const switchLink = el("button", { class: "tab-link", type: "button" }, [
    isRegister ? a.switchToLogin : a.switchToRegister,
  ]);
  switchLink.addEventListener("click", () => {
    // Clean swap: a brand-new form is built, the old one (and its
    // listeners) is dropped whole - no stale nodes/handlers left behind.
    draft.mode = isRegister ? "login" : "register";
    draft.password = "";
    draft.confirm = "";
    container.replaceWith(renderAuth());
  });

  // Autofill can land after first paint without an event in some browsers.
  window.setTimeout(() => {
    if (container.isConnected) readInputs();
  }, 250);

  container.replaceChildren(
    page(
      isRegister ? a.registerTitle : a.loginTitle,
      helper,
      el("div", { class: "panel" }, [form]),
      el("div", { class: "auth-switch" }, [switchLink])
    )
  );
  refresh();
  return container;
}
