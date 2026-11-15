import { el } from "./dom";
import { ICON_CHECK, ICON_EYE, ICON_EYE_OFF } from "./logo";
import { t } from "./theme-i18n";

/** Password policy UI shared by sign-up (views/auth.ts) and change-password
 * (views/profile-account.ts). Mirrors the backend rule set in
 * app/core/security.validate_password_strength: 8+ characters, ASCII lower
 * and upper case, a digit and one ASCII punctuation symbol. */

const SYMBOL_RE = /[!-/:-@[-`{-~]/; // any ASCII punctuation symbol

export interface Rule {
  label: string;
  test: (value: string) => boolean;
}

export function passwordRules(): Rule[] {
  const a = t().auth;
  return [
    { label: a.ruleMinLength, test: (v) => v.length >= 8 },
    { label: a.ruleLower, test: (v) => /[a-z]/.test(v) },
    { label: a.ruleUpper, test: (v) => /[A-Z]/.test(v) },
    { label: a.ruleDigit, test: (v) => /\d/.test(v) },
    { label: a.ruleSymbol, test: (v) => SYMBOL_RE.test(v) },
  ];
}

/** True when `value` satisfies every password rule (same check as the checklist). */
export function isStrongPassword(value: string): boolean {
  return passwordRules().every((rule) => rule.test(value));
}

/** "Live hint" checklist: each row goes gray -> green as its rule is met. */
export function checklist(id: string, title: string, rules: Rule[]) {
  const a = t().auth;
  const items = rules.map((rule) => {
    const mark = el("span", { class: "hint-mark", "aria-hidden": "true" });
    mark.innerHTML = ICON_CHECK;
    // Colour + tick alone are invisible to screen readers: a visually hidden
    // status word is updated together with the class.
    const status = el("span", { class: "sr-only" });
    const item = el("li", { class: "hint" }, [mark, el("span", {}, [rule.label]), status]);
    return { rule, item, status };
  });
  const node = el("div", { class: "hint-list", id, role: "group", "aria-label": title }, [
    el("div", { class: "hint-title" }, [title]),
    el("ul", {}, items.map((i) => i.item)),
  ]);
  /** Returns true when every rule passes. */
  function update(value: string): boolean {
    let all = true;
    for (const { rule, item, status } of items) {
      const ok = rule.test(value);
      item.classList.toggle("hint--ok", ok);
      status.textContent = ` — ${ok ? a.ruleMet : a.ruleNotMet}`;
      if (!ok) all = false;
    }
    return all;
  }
  return { node, update };
}

/** Password input with a Show/Hide (eye) toggle. */
export function passwordField(id: string, label: string, autocomplete: string, value: string) {
  const a = t().auth;
  const input = el("input", { type: "password", id, autocomplete, required: "true" }) as HTMLInputElement;
  input.value = value;

  const toggle = el("button", { class: "input-toggle", type: "button", "aria-controls": id }) as HTMLButtonElement;
  function syncToggle() {
    const visible = input.type === "text";
    toggle.innerHTML = visible ? ICON_EYE_OFF : ICON_EYE;
    toggle.setAttribute("aria-label", visible ? a.hidePassword : a.showPassword);
    toggle.setAttribute("aria-pressed", String(visible));
    toggle.title = visible ? a.hidePassword : a.showPassword;
  }
  toggle.addEventListener("click", () => {
    input.type = input.type === "password" ? "text" : "password";
    syncToggle();
    input.focus();
  });
  syncToggle();

  const node = el("div", { class: "field" }, [
    el("label", { for: id }, [label]),
    el("div", { class: "input-wrap" }, [input, toggle]),
  ]);
  return { node, input };
}
