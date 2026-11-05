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

/** Each top-level property of an interface, with the engine its JSDoc restricts it to. */
function options(source: string, name: string): Map<string, "native" | "mock" | "both"> {
  const result = new Map<string, "native" | "mock" | "both">();
  let doc = "";
  for (const line of interfaceBody(source, name).split("\n")) {
    if (/^ {2}\/\*\*/.test(line)) doc = "";
    doc += `${line}\n`;
    const property = /^ {2}([a-zA-Z]+)\??:/.exec(line);
    if (!property) continue;
    // The JSDoc directly above this property, and nothing from an earlier one.
    const only = /`engine: '(native|mock)'` only/.exec(doc);
    result.set(property[1], only ? (only[1] as "native" | "mock") : "both");
    doc = "";
  }
  return result;
}

/** Each `## \`option\`` section of the page: its header's Engine, and its text. */
function sections(page: string): Map<string, { engine?: string; text: string }> {
  const result = new Map<string, { engine?: string; text: string }>();
  const parts = page.split(/^## `([a-zA-Z]+)`$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const text = parts[i + 1];
    const header =
      /^\s*\*\*Type:\*\* .+ · \*\*Default:\*\* .+ · \*\*Engine:\*\* (native|mock|both)$/m.exec(
        text.split("\n\n")[1] ?? "",
      );
    result.set(parts[i], { engine: header?.[1], text });
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
    for (const [name, engine] of declared) {
      expect(documented.get(name)?.engine, name).toBe(engine);
    }
  });

  it("names every key of the hotRuntime object", () => {
    const keys = [
      ...options(source, "HotRuntimeRecycleOptions").keys(),
      // From the union in VitestNativeOptions.hotRuntime, not the shared interface.
      "mode",
      "allowUnboundedMemory",
    ];
    const text = documented.get("hotRuntime")?.text ?? "";
    for (const key of keys) expect(text, key).toContain(`\`${key}\``);
  });
});
