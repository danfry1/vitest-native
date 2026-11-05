import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The options page documents every option of reactNative(), each under the same header
// (Type · Default · Engine). It had fallen behind the type: metroConfig was missing,
// transform's object form was undocumented, and engine notes were scattered prose. Each
// option of VitestNativeOptions now needs a section, its Engine must agree with the
// type's own "`engine: '…'` only" note, and every key of the hotRuntime object must be
// named in its section.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = path.join(packageRoot, "src", "types.ts");
const PAGE = path.resolve(packageRoot, "../../website/guide/plugin-options.md");

/** The body of `export interface <name> { … }` in types.ts. */
function interfaceBody(source: string, name: string): string {
  const start = source.indexOf(`export interface ${name} {`);
  if (start === -1) throw new Error(`no interface ${name} in src/types.ts`);
  return source.slice(start, source.indexOf("\n}\n", start));
}

type Declared = { engine: "native" | "mock" | "both"; type: string };

/** A TypeScript type as one line, in the page's spelling (single quotes, no leading `|`). */
const normalize = (type: string) =>
  type
    .replace(/\s+/g, " ")
    .replace(/"/g, "'")
    .replace(/^\s*\|\s*/, "")
    .replace(/;\s*\}/g, " }")
    .replace(/;$/, "")
    .trim();

/** Each top-level property of an interface, with its type and the engine its JSDoc restricts it to. */
function options(source: string, name: string): Map<string, Declared> {
  const result = new Map<string, Declared>();
  const lines = interfaceBody(source, name).split("\n");
  let doc = "";
  lines.forEach((line, index) => {
    if (/^ {2}\/\*\*/.test(line)) doc = "";
    doc += `${line}\n`;
    const property = /^ {2}([a-zA-Z]+)\??:(.*)$/.exec(line);
    if (!property) return;
    // A type that continues on lines indented deeper than the property.
    let type = property[2];
    for (let next = index + 1; next < lines.length && /^ {4}/.test(lines[next]); next++) {
      type += ` ${lines[next]}`;
    }
    // The JSDoc directly above this property, and nothing from an earlier one.
    const only = /`engine: '(native|mock)'` only/.exec(doc);
    result.set(property[1], {
      engine: only ? (only[1] as "native" | "mock") : "both",
      type: normalize(type),
    });
    doc = "";
  });
  return result;
}

type Section = { type?: string; engine?: string; text: string };

/** Each `## \`option\`` section of the page: its header's Type and Engine, and its text. */
function sections(page: string): Map<string, Section> {
  const result = new Map<string, Section>();
  const parts = page.split(/^## `([a-zA-Z]+)`$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const text = parts[i + 1];
    const header =
      /^\s*\*\*Type:\*\* `(.+)` · \*\*Default:\*\* .+ · \*\*Engine:\*\* (native|mock|both)$/m.exec(
        text.split("\n\n")[1] ?? "",
      );
    result.set(parts[i], { type: header?.[1], engine: header?.[2], text });
  }
  return result;
}

describe("website/guide/plugin-options.md", () => {
  const source = fs.readFileSync(TYPES, "utf8");
  const declared = options(source, "VitestNativeOptions");
  const documented = sections(fs.readFileSync(PAGE, "utf8"));

  it("reads the options from the type", () => {
    // An empty read would make every comparison below vacuous.
    expect(declared.size).toBeGreaterThanOrEqual(10);
  });

  it("has one section for each option of VitestNativeOptions, and no other", () => {
    expect([...documented.keys()].sort()).toEqual([...declared.keys()].sort());
  });

  it("opens each section with Type, Default and the engine the type restricts it to", () => {
    for (const [name, { engine }] of declared) {
      expect(documented.get(name)?.engine, name).toBe(engine);
    }
  });

  // The page writes two types in readers' terms; every other Type is the declared one.
  const READER_TYPES: Record<string, string> = {
    mocks: "Record<string, JSON value>",
    hotRuntime: "boolean | 'auto' | object",
  };

  it("gives each option its declared type", () => {
    for (const [name, { type }] of declared) {
      expect(documented.get(name)?.type, name).toBe(READER_TYPES[name] ?? type);
    }
  });

  it("has a table row for every key the hotRuntime object accepts", () => {
    // The list the option validator accepts (src/validate.ts), which covers the keys of
    // every member of the hotRuntime union, not only the shared interface.
    const validate = fs.readFileSync(path.join(packageRoot, "src", "validate.ts"), "utf8");
    const list = /const KNOWN_HOT_RUNTIME_OPTIONS = \[([\s\S]*?)\]/.exec(validate);
    const keys = [...(list?.[1] ?? "").matchAll(/"([a-zA-Z]+)"/g)].map(([, key]) => key);
    expect(keys.length).toBeGreaterThanOrEqual(6);
    for (const key of options(source, "HotRuntimeRecycleOptions").keys())
      expect(keys).toContain(key);
    const text = documented.get("hotRuntime")?.text ?? "";
    for (const key of keys) expect(text, key).toMatch(new RegExp(`^\\| \`${key}\` \\|`, "m"));
  });
});
