import { el } from "../dom";
import { draftClear, draftClearPrefix, draftGet, draftSet } from "./drafts";

/**
 * formField: label + control + hint + error, wired for screen readers, with
 * the typed value kept in the draft store so a language switch (which
 * rebuilds the view) does not clear it.
 *
 *   const name = formField({ id: "display-name", label: dict.auth.username, required: true });
 *   container.append(name.node);
 *   // on submit:
 *   if (!name.getValue().trim()) { name.setError(dict.errors.validation); name.focus(); return; }
 *   // after a successful save:
 *   clearFieldDraft("display-name");
 *
 * `id` must be stable across renders: it is the draft key and the base of the
 * element ids (`<id>-control`, `<id>-hint`, `<id>-error`).
 * Existing `.field` / `.field-hint` styles from style.css are reused.
 */

export interface FormFieldOptions {
  id: string;
  label: string;
  control?: "input" | "textarea" | "select";
  /** <input type>, default "text". */
  type?: string;
  /** Initial value, used only when no draft exists for this id. */
  value?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  options?: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  autocomplete?: string;
  inputMode?: string;
  /** Ids of always-visible help elsewhere on the page (a rules list, say); listed first in aria-describedby. */
  describedBy?: readonly string[];
  /** Fires on every edit. The field's own error is cleared automatically. */
  onInput?: (value: string) => void;
}

export type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface FormFieldHandle {
  node: HTMLElement;
  control: FormControl;
  getValue(): string;
  setValue(value: string): void;
  setError(message: string | null): void;
  setHint(message: string | null): void;
  focus(): void;
}

const LTR_TYPES = new Set(["email", "url", "password", "number", "tel"]);
const draftKey = (id: string) => `field:${id}`;

/** Forget the draft of one field (call after a successful save). */
export function clearFieldDraft(id: string): void {
  draftClear(draftKey(id));
}

/** Forget every field draft whose id starts with `idPrefix`. */
export function clearFieldDraftsByPrefix(idPrefix: string): void {
  draftClearPrefix(draftKey(idPrefix));
}

export function formField(o: FormFieldOptions): FormFieldHandle {
  const controlId = `${o.id}-control`;
  const hintId = `${o.id}-hint`;
  const errorId = `${o.id}-error`;
  const kind = o.control ?? "input";
  const type = o.type ?? "text";

  const attrs: Record<string, string> = { id: controlId, name: o.id };
  if (o.required) attrs["aria-required"] = "true";
  if (o.placeholder) attrs.placeholder = o.placeholder;
  if (o.autocomplete) attrs.autocomplete = o.autocomplete;
  if (kind !== "select") attrs.dir = LTR_TYPES.has(type) ? "ltr" : "auto"; // free text may be Persian or English
  if (o.maxLength !== undefined && kind !== "select") attrs.maxlength = String(o.maxLength);

  let control: FormControl;
  if (kind === "textarea") {
    if (o.rows) attrs.rows = String(o.rows);
    control = el("textarea", attrs);
  } else if (kind === "select") {
    control = el("select", attrs, (o.options ?? []).map((opt) => el("option", { value: opt.value }, [opt.label])));
  } else {
    attrs.type = type;
    if (o.inputMode) attrs.inputmode = o.inputMode;
    control = el("input", attrs);
  }

  // Draft wins over the initial value: it is what the user had typed before the re-render.
  const wanted = draftGet<string>(draftKey(o.id)) ?? o.value ?? "";
  control.value = wanted;

  const labelEl = el("label", { for: controlId }, [o.label]);
  if (o.required) labelEl.append(el("span", { class: "ui-field__req", "aria-hidden": "true" }, ["*"]));
  const hintEl = el("p", { class: "field-hint", id: hintId });
  const errorEl = el("p", { class: "field-hint field-hint--warn", id: errorId, "aria-live": "polite" });

  let hint: string | null = o.hint ?? null;
  let error: string | null = o.error ?? null;

  /** Keeps text, visibility, aria-describedby and aria-invalid in step. */
  function sync(): void {
    hintEl.textContent = hint ?? "";
    hintEl.hidden = !hint;
    errorEl.textContent = error ?? "";
    errorEl.hidden = !error;
    const describedBy = [...(o.describedBy ?? []), hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ");
    if (describedBy) control.setAttribute("aria-describedby", describedBy);
    else control.removeAttribute("aria-describedby");
    if (error) control.setAttribute("aria-invalid", "true");
    else control.removeAttribute("aria-invalid");
  }

  const onChange = () => {
    draftSet(draftKey(o.id), control.value);
    if (error) {
      error = null;
      sync();
    }
    o.onInput?.(control.value);
  };
  control.addEventListener(kind === "select" ? "change" : "input", onChange);

  sync();

  return {
    node: el("div", { class: "field ui-field" }, [labelEl, control, hintEl, errorEl]),
    control,
    getValue: () => control.value,
    setValue(value) {
      control.value = value;
      draftSet(draftKey(o.id), control.value);
    },
    setError(message) {
      error = message;
      sync();
    },
    setHint(message) {
      hint = message;
      sync();
    },
    focus: () => control.focus(),
  };
}
