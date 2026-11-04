/**
 * Each runtime module ships once.
 *
 * The runtime .mjs files under src/ ship verbatim: Node loads them as files, so the
 * build copies them into dist. A TypeScript entry that imports one must import that
 * shipped file, not inline a second copy into its chunk. An inlined copy is a second
 * module instance with its own caches and module state, and the package carries the
 * code twice. Fourteen modules, about 63 KB of inlined copies, shipped that way until
 * tsdown.config.ts marked them as never bundled.
 *
 * "Verbatim" is measured, not listed: a dist file byte-identical to the src file at
 * the same path. A runtime module added later is covered without editing this file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(packageRoot, "dist");
const src = path.join(packageRoot, "src");
const distExists = fs.existsSync(dist);

const posix = (file: string) => file.split(path.sep).join("/");

function shippedCode(): { verbatim: string[]; bundled: string[] } {
  const verbatim: string[] = [];
  const bundled: string[] = [];
  for (const entry of fs.readdirSync(dist, { recursive: true }) as string[]) {
    const file = posix(entry);
    if (!/\.[cm]js$/.test(file)) continue;
    const source = path.join(src, file);
    const same =
      fs.existsSync(source) &&
      fs.readFileSync(source).equals(fs.readFileSync(path.join(dist, file)));
    (same ? verbatim : bundled).push(file);
  }
  return { verbatim: verbatim.sort(), bundled: bundled.sort() };
}

/** The src modules rolldown inlined into a bundled file, from its region markers. */
function inlinedModules(file: string): string[] {
  const text = fs.readFileSync(path.join(dist, file), "utf8");
  return [...text.matchAll(/^\/\/#region (src\/\S+)$/gm)].map((m) => m[1]!.slice("src/".length));
}

describe("verbatim runtime modules ship once", () => {
  it("has a build to check against", () => {
    expect(distExists, "run `bun run build` before this suite — CI builds first").toBe(true);
  });

  it.runIf(distExists)("finds both kinds of file, so neither check is vacuous", () => {
    const { verbatim, bundled } = shippedCode();
    expect(verbatim).toEqual(
      expect.arrayContaining(["errors.mjs", "native/transform.mjs", "jest-compat/setup.mjs"]),
    );
    expect(bundled).toEqual(expect.arrayContaining(["index.mjs", "setup.mjs", "helpers.cjs"]));
    // The markers this relies on are still emitted: the plugin is inlined into the
    // root entry, and the memory planner (a src .mjs that is not copied) into a chunk.
    const all = bundled.flatMap(inlinedModules);
    expect(all).toEqual(expect.arrayContaining(["plugin.ts", "native/memory.mjs"]));
  });

  it.runIf(distExists)("inlines no verbatim module into a bundled file", () => {
    const { verbatim, bundled } = shippedCode();
    const shipped = new Set(verbatim);
    const duplicates = bundled.flatMap((file) =>
      inlinedModules(file)
        .filter((module) => shipped.has(module))
        .map((module) => `${module} is inlined into dist/${file}`),
    );
    expect(
      duplicates,
      `import the shipped copy instead (deps.neverBundle in tsdown.config.ts):\n${duplicates.join("\n")}`,
    ).toEqual([]);
  });

  it.runIf(distExists)("emits relative imports that resolve inside dist", () => {
    const { bundled } = shippedCode();
    // Emitted module specifiers only: prose and fixtures inside the bundles also hold
    // relative strings ("./config"), but never one naming a JavaScript file.
    const specifier =
      /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["'](\.{1,2}\/[^"']+\.[cm]?js)["']/g;
    const unresolved: string[] = [];
    let checked = 0;
    for (const file of bundled) {
      const text = fs.readFileSync(path.join(dist, file), "utf8");
      for (const [, spec] of text.matchAll(specifier)) {
        checked++;
        const target = path.resolve(path.dirname(path.join(dist, file)), spec!);
        if (!fs.existsSync(target)) unresolved.push(`dist/${file}: ${spec}`);
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(unresolved, unresolved.join("\n")).toEqual([]);
  });
});
