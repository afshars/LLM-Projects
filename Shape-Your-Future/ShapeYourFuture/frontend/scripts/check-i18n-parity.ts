/**
 * i18n parity check (fa vs en). Run: `npm run check:i18n` (vite-node, which ships with vitest: no new dependency).
 *
 * TypeScript already guarantees that `fa` has every key of `en` (it is typed `typeof en`). This script covers what the
 * compiler cannot see:
 *   ERROR  key present in one language only (also catches an array of a different length, or a string vs a function)
 *   ERROR  empty / whitespace-only value (a function is judged by what it returns)
 *   ERROR  placeholder mismatch
 *            - plain strings:    the set of {name} tokens must be equal in en and fa;
 *            - function values:  this project writes copy as `(count, shown) => ...`, so "placeholders" are the
 *                                ARGUMENTS. The function is called with probe values; the number of declared
 *                                arguments and the set of arguments that show up in the output must be equal.
 *   WARN   fa value identical to en (probably not translated). Skipped: values without letters (numbers, units,
 *          symbols) and the ALLOW_SAME list below.
 *
 * Exit code 1 when there is at least one ERROR (also on warnings with --strict), else 0.
 * Flags: --all (print every finding, default shows 8 per check), --strict (warnings fail too).
 */
import { DICTIONARIES } from "../src/lib/dictionary";

// ---------------------------------------------------------------- allowlist (identical en/fa is fine here)

/** Exact values (trimmed) that are meant to stay Latin: brand names, product terms. Add to it, do not weaken the check. */
const ALLOW_SAME_VALUES = new Set<string>([]); // empty on purpose: today nothing is identical, so nothing needs an exception
/** Dot-path patterns whose value may be identical: codes, units, language endonyms... */
const ALLOW_SAME_PATHS: RegExp[] = [];
/** Dot-paths that are empty ON PURPOSE (in both languages). None today: an empty string is a bug. */
const ALLOW_EMPTY_PATHS: RegExp[] = [];

// ---------------------------------------------------------------- flatten

type Leaf = { kind: "string"; value: string } | { kind: "function"; fn: (...args: unknown[]) => unknown } | { kind: "other"; value: unknown };

function flatten(node: unknown, path: string, out: Map<string, Leaf>): void {
  if (typeof node === "string") out.set(path, { kind: "string", value: node });
  else if (typeof node === "function") out.set(path, { kind: "function", fn: node as (...args: unknown[]) => unknown });
  else if (Array.isArray(node)) node.forEach((child, i) => flatten(child, `${path}[${i}]`, out));
  else if (node !== null && typeof node === "object") for (const [key, child] of Object.entries(node)) flatten(child, path ? `${path}.${key}` : key, out);
  else out.set(path, { kind: "other", value: node });
}

const leaves = (root: unknown): Map<string, Leaf> => {
  const out = new Map<string, Leaf>();
  flatten(root, "", out);
  return out;
};

// ---------------------------------------------------------------- probing function values

const mark = (i: number): string => `\u27E6${i}\u27E7`; // ⟦0⟧ ⟦1⟧ ...

interface Probe {
  /** Every string the function returned over the probe calls. */
  outputs: string[];
  /** Output when every argument is its marker: comparable between languages. */
  plain: string;
  /** Which argument numbers appear in some output. */
  used: number[];
  error?: string;
}

/**
 * Calls `fn` with markers as arguments. An argument counts as "used" when:
 *   - its marker shows up in an output (`${shown}`), or
 *   - changing it from 7 to 8 changes the output (it is formatted first, e.g. `Intl.NumberFormat(...).format(n)`,
 *     so the marker never survives).
 * Plus one call per position with the number 1 there, so a `count === 1` plural branch is seen for the empty-text
 * check. A value used ONLY to choose singular / plural (1 vs not 1) is not "used": fa may leave it out.
 */
function probe(fn: (...args: unknown[]) => unknown): Probe {
  const n = fn.length;
  const markers = Array.from({ length: n }, (_, i) => mark(i));
  const withAt = (i: number, value: unknown): unknown[] => markers.map((m, j) => (j === i ? value : m));
  const calls: unknown[][] = [markers];
  for (let i = 0; i < n; i++) calls.push(withAt(i, 1));
  const outputs: string[] = [];
  const run = (callArgs: unknown[]): string | null => {
    const out = fn(...callArgs);
    if (typeof out !== "string") return null;
    outputs.push(out);
    return out;
  };
  try {
    for (const callArgs of calls) if (run(callArgs) === null) return { outputs, plain: "", used: [], error: "does not return a string" };
    const used = new Set<number>();
    markers.forEach((m, i) => outputs.some((o) => o.includes(m)) && used.add(i));
    for (let i = 0; i < n; i++) {
      const a = run(withAt(i, 7));
      const b = run(withAt(i, 8));
      if (a !== b) used.add(i);
    }
    return { outputs, plain: outputs[0], used: [...used].sort((x, y) => x - y) };
  } catch (err) {
    return { outputs, plain: "", used: [], error: `throws when probed: ${(err as Error).message}` };
  }
}

const TOKEN = /\{[A-Za-z_][A-Za-z0-9_]*\}/g;
const tokens = (s: string): string[] => [...new Set(s.match(TOKEN) ?? [])].sort();
const same = (a: readonly unknown[], b: readonly unknown[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

// ---------------------------------------------------------------- run

const args = new Set(process.argv.slice(2));
const showAll = args.has("--all");
const strict = args.has("--strict");
const LIMIT = 8;

const en = leaves(DICTIONARIES.en);
const fa = leaves(DICTIONARIES.fa);

interface Finding {
  path: string;
  detail?: string;
}
const missingInFa: Finding[] = [];
const missingInEn: Finding[] = [];
const empty: Finding[] = [];
const placeholders: Finding[] = [];
const identical: Finding[] = [];

for (const path of en.keys()) if (!fa.has(path)) missingInFa.push({ path });
for (const path of fa.keys()) if (!en.has(path)) missingInEn.push({ path });

const probes = new Map<string, Probe>();
const probed = (lang: "en" | "fa", path: string, leaf: Extract<Leaf, { kind: "function" }>): Probe => {
  const key = `${lang}:${path}`;
  let p = probes.get(key);
  if (!p) probes.set(key, (p = probe(leaf.fn)));
  return p;
};

/** The texts a leaf can show (a string: itself; a function: what it returned when probed). null = cannot tell. */
const textsOf = (lang: "en" | "fa", path: string, leaf: Leaf): string[] | null => (leaf.kind === "string" ? [leaf.value] : leaf.kind === "function" ? (probed(lang, path, leaf).error ? null : probed(lang, path, leaf).outputs) : null);

for (const lang of ["en", "fa"] as const) {
  for (const [path, leaf] of lang === "en" ? en : fa) {
    if (leaf.kind === "function") {
      const p = probed(lang, path, leaf);
      if (p.error) empty.push({ path: `${lang}:${path}`, detail: p.error });
    }
    const texts = textsOf(lang, path, leaf);
    if (texts && texts.some((tx) => tx.trim() === "") && !ALLOW_EMPTY_PATHS.some((re) => re.test(path))) empty.push({ path: `${lang}:${path}`, detail: leaf.kind === "function" ? "returns an empty text" : "empty" });
  }
}

for (const [path, a] of en) {
  const b = fa.get(path);
  if (!b) continue;
  if (a.kind !== b.kind) {
    placeholders.push({ path, detail: `en is a ${a.kind}, fa is a ${b.kind}` });
    continue;
  }
  if (a.kind === "string" && b.kind === "string") {
    const ta = tokens(a.value);
    const tb = tokens(b.value);
    if (!same(ta, tb)) placeholders.push({ path, detail: `en ${ta.join(" ") || "none"} vs fa ${tb.join(" ") || "none"}` });
    const trimmed = a.value.trim();
    if (trimmed !== "" && trimmed === b.value.trim() && /\p{L}/u.test(trimmed) && !ALLOW_SAME_VALUES.has(trimmed) && !ALLOW_SAME_PATHS.some((re) => re.test(path))) identical.push({ path, detail: JSON.stringify(trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed) });
  } else if (a.kind === "function" && b.kind === "function") {
    const pa = probed("en", path, a);
    const pb = probed("fa", path, b);
    if (pa.error || pb.error) continue; // already reported under "empty / not probeable"
    if (a.fn.length !== b.fn.length) placeholders.push({ path, detail: `en takes ${a.fn.length} argument(s), fa takes ${b.fn.length}` });
    else if (!same(pa.used, pb.used)) placeholders.push({ path, detail: `prints argument ${pa.used.map((i) => i + 1).join(",") || "none"} in en, ${pb.used.map((i) => i + 1).join(",") || "none"} in fa` });
    const plain = pa.plain.trim();
    if (plain !== "" && plain === pb.plain.trim() && /\p{L}/u.test(plain.replace(/\u27E6\d+\u27E7/g, "")) && !ALLOW_SAME_PATHS.some((re) => re.test(path))) identical.push({ path, detail: "(function) same text" });
  }
}

// ---------------------------------------------------------------- report

let errors = 0;
let warnings = 0;
const report = (kind: "error" | "warn", title: string, found: Finding[]): void => {
  const icon = found.length === 0 ? "ok  " : kind === "error" ? "FAIL" : "warn";
  console.log(`${icon} ${title}${found.length ? ` (${found.length})` : ""}`);
  if (found.length === 0) return;
  if (kind === "error") errors += found.length;
  else warnings += found.length;
  for (const f of showAll ? found : found.slice(0, LIMIT)) console.log(`       ${f.path}${f.detail ? `  ${f.detail}` : ""}`);
  if (!showAll && found.length > LIMIT) console.log(`       ... and ${found.length - LIMIT} more (--all)`);
};

console.log(`i18n parity: en ${en.size} values, fa ${fa.size} values`);
report("error", "keys missing in fa", missingInFa);
report("error", "keys missing in en", missingInEn);
report("error", "empty or whitespace-only values / functions that cannot be probed", empty);
report("error", "placeholder / argument / type mismatch", placeholders);
report("warn", "fa identical to en (untranslated?)", identical);

if (errors > 0 || (strict && warnings > 0)) {
  console.log(`\n${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
}
console.log(warnings > 0 ? `\nOK with ${warnings} warning(s)` : "\nOK");
