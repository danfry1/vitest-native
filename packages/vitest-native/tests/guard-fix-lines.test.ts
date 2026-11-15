/**
 * User-facing messages tell users what to set: the ownership guard's
 * `reactNative({ experimental: { ownershipModel: 'resolution' } })`, the hang watch's
 * `reactNative({ hangTimeout })`, a migrate hint's `reactNative({ transform: [...] })`.
 * A renamed or removed option would leave those lines pointing at nothing, silently.
 *
 * This reads every `reactNative({ … })` in src/ (messages, hints and doc comments alike)
 * and checks the options it names: its top-level options are declared in
 * VitestNativeOptions, and its `experimental` options are ones validateOptions knows. A
 * snippet that is plain literal JavaScript is also handed to validateOptions whole, so its
 * values are checked too. Placeholders (`[...]`, `…`, `${…}`, `'ios' | 'android'`) and
 * shorthand keep a snippet to the name check.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { validateOptions } from "../src/validate.js";

const SRC = path.join(import.meta.dirname, "../src");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.[cm]?[jt]s$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

/** The options VitestNativeOptions declares, read from its source. */
function declaredOptions(): Set<string> {
  const types = fs.readFileSync(path.join(SRC, "types.ts"), "utf8");
  const start = types.indexOf("export interface VitestNativeOptions");
  expect(start).toBeGreaterThan(-1);
  // Its members sit two spaces in; nested object types sit deeper.
  const body = types.slice(start, types.indexOf("\n}\n", start));
  return new Set([...body.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]));
}

/** Skips the string or template literal starting at `i`; returns the index after it. */
function skipString(text: string, i: number): number {
  const quote = text[i];
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === "\\") j++;
    else if (text[j] === quote) return j + 1;
  }
  return text.length;
}

/** Every `reactNative({ … })` object literal in `source`, as written. */
function snippets(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/reactNative\(\{/g)) {
    const open = (match.index ?? 0) + "reactNative(".length;
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      const c = source[i];
      if (c === "'" || c === '"') i = skipString(source, i) - 1;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        found.push(source.slice(open, i + 1));
        break;
      }
    }
  }
  return found;
}

/** The value text starting at `i`: up to the `,` or closing bracket that ends it. */
function valueAt(text: string, i: number): string {
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (c === "'" || c === '"' || c === "`") j = skipString(text, j) - 1;
    else if ("{[(".includes(c)) depth++;
    else if ("}])".includes(c)) {
      if (depth === 0) return text.slice(i, j).trim();
      depth--;
    } else if (c === "," && depth === 0) return text.slice(i, j).trim();
  }
  return text.slice(i).trim();
}

/**
 * The keys at the top level of the object literal `text`, each with its value text.
 * Strings and nested brackets are skipped; a doc comment's `*` line prefixes and a `…`
 * read as whitespace.
 */
function topKeys(text: string): Map<string, string> {
  const keys = new Map<string, string>();
  let depth = 0;
  let expectKey = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"' || c === "`") {
      const end = skipString(text, i);
      const colon = text.slice(end).match(/^\s*:/);
      if (depth === 1 && expectKey && c !== "`" && colon) {
        keys.set(text.slice(i + 1, end - 1), valueAt(text, end + colon[0].length));
      }
      expectKey = false;
      i = end - 1;
    } else if ("{[(".includes(c)) {
      depth++;
      expectKey = depth === 1;
    } else if ("}])".includes(c)) depth--;
    else if (c === "," && depth === 1) expectKey = true;
    else if (depth === 1 && expectKey && /[A-Za-z_]/.test(c)) {
      const name = text.slice(i).match(/^\w+/)![0];
      const rest = text.slice(i + name.length).match(/^\s*([:,}])/);
      // `key: value`, or a shorthand `key` followed by `,` or `}`.
      if (rest)
        keys.set(name, rest[1] === ":" ? valueAt(text, i + name.length + rest[0].length) : "");
      expectKey = false;
      i += name.length - 1;
    } else if (depth === 1 && expectKey && !/[\s*…]/.test(c)) expectKey = false;
  }
  return keys;
}

/** The snippet as a value, when it is plain literal JavaScript; else null. */
function literal(text: string): Record<string, unknown> | null {
  if (/\.\.\.|…|\$\{|\s\|\s/.test(text) || /^\s*\*/m.test(text)) return null;
  try {
    return new Function(`"use strict"; return (${text});`)() as Record<string, unknown>;
  } catch {
    return null; // shorthand or a call: names only
  }
}

it("names only options the plugin accepts, everywhere in src", () => {
  const declared = declaredOptions();
  const found = sourceFiles(SRC).flatMap((file) =>
    snippets(fs.readFileSync(file, "utf8")).map((text) => ({
      where: path.relative(SRC, file),
      text,
    })),
  );
  let named = 0;
  let evaluated = 0;
  for (const { where, text } of found) {
    const keys = topKeys(text);
    if (keys.size > 0) named++;
    for (const key of keys.keys()) {
      expect(
        declared.has(key),
        `${where}: ${text}\n"${key}" is not a VitestNativeOptions option`,
      ).toBe(true);
    }
    const experimental = keys.get("experimental");
    if (experimental?.startsWith("{")) {
      const names = [...topKeys(experimental).keys()];
      expect(names.length, `${where}: ${text}`).toBeGreaterThan(0);
      const asUnset = Object.fromEntries(names.map((name) => [name, undefined]));
      expect(() => validateOptions({ experimental: asUnset }), `${where}: ${text}`).not.toThrow();
    }
    const value = literal(text);
    if (value) {
      evaluated++;
      expect(() => validateOptions(value), `${where}: ${text}`).not.toThrow();
    }
  }
  // Not vacuous: the guard's lines and the hints across the package, and enough that
  // evaluate to check values too (ownership: 'error', ownershipModel, nodeMocks, presets).
  expect(named).toBeGreaterThanOrEqual(20);
  expect(evaluated).toBeGreaterThanOrEqual(10);
});

it("reads the option names out of a snippet as written", () => {
  const names = (text: string) => [...topKeys(text).keys()];
  expect(names("{ hangTimeout }")).toEqual(["hangTimeout"]);
  expect(names("{ transform: [...] }")).toEqual(["transform"]);
  expect(names("{\n   *   engine: 'native',\n   *   presets: { skia: false },\n   * }")).toEqual([
    "engine",
    "presets",
  ]);
  expect(names("{ experimental: { ownershipModel: 'a,b' }, x: 1 }")).toEqual(["experimental", "x"]);
  expect(names("{ 'quoted': 1, ${spread} }")).toEqual(["quoted"]);
  expect(names("{ … }")).toEqual([]);
  expect(topKeys("{ experimental: { nodeMocks: true } }").get("experimental")).toBe(
    "{ nodeMocks: true }",
  );
});

it("names ownership.allow in the shape the option takes", () => {
  const ledger = fs.readFileSync(path.join(SRC, "native/ownership-ledger.mjs"), "utf8");
  expect(ledger).toContain("ownership.allow: [{ path, reason }]");
  expect(() =>
    validateOptions({ ownership: { mode: "warn", allow: [{ path: "src/x", reason: "why" }] } }),
  ).not.toThrow();
});
