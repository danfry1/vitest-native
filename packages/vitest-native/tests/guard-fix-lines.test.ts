/**
 * The ownership guard's messages tell a user what to set: `reactNative({ ownership:
 * 'error' })`, `reactNative({ experimental: { ownershipModel: 'resolution' } })`,
 * `reactNative({ experimental: { nodeMocks: true } })`, `ownership.allow`. A renamed or
 * removed option would leave those lines pointing at nothing, silently. This reads every
 * `reactNative({ … })` the guard's source writes and checks it is a configuration the
 * plugin accepts: its top-level options are declared in VitestNativeOptions, and
 * validateOptions takes the whole object.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { validateOptions } from "../src/validate.js";

const SRC = path.join(import.meta.dirname, "../src");
const GUARD_SOURCES = ["native/ownership-ledger.mjs"];

/** The options VitestNativeOptions declares, read from its source. */
function declaredOptions(): Set<string> {
  const types = fs.readFileSync(path.join(SRC, "types.ts"), "utf8");
  const start = types.indexOf("export interface VitestNativeOptions");
  expect(start).toBeGreaterThan(-1);
  // Its members sit two spaces in; nested object types sit deeper.
  const body = types.slice(start, types.indexOf("\n}\n", start));
  return new Set([...body.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]));
}

/** Every `reactNative({ … })` object literal in `source`, as written. */
function snippets(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/reactNative\(\{/g)) {
    let depth = 0;
    const open = (match.index ?? 0) + "reactNative(".length;
    for (let i = open; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}" && --depth === 0) {
        found.push(source.slice(open, i + 1));
        break;
      }
    }
  }
  return found;
}

it("names only options the plugin accepts", () => {
  const declared = declaredOptions();
  const all = GUARD_SOURCES.flatMap((file) =>
    snippets(fs.readFileSync(path.join(SRC, file), "utf8")),
  );
  // ownership: 'error', ownershipModel and nodeMocks at least: not vacuous.
  expect(all.length).toBeGreaterThanOrEqual(3);
  for (const text of all) {
    const options = new Function(`return (${text});`)() as Record<string, unknown>;
    for (const key of Object.keys(options)) {
      expect(declared.has(key), `${text}: "${key}" is not a VitestNativeOptions option`).toBe(true);
    }
    expect(() => validateOptions(options), text).not.toThrow();
  }
});

it("names ownership.allow in the shape the option takes", () => {
  const ledger = fs.readFileSync(path.join(SRC, "native/ownership-ledger.mjs"), "utf8");
  expect(ledger).toContain("ownership.allow: [{ path, reason }]");
  expect(() =>
    validateOptions({ ownership: { mode: "warn", allow: [{ path: "src/x", reason: "why" }] } }),
  ).not.toThrow();
});
