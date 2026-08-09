/**
 * The versioning contract enumerates the public surface. An enumeration in prose
 * drifts the moment an export is added, and a stale contract is worse than none —
 * it is a promise about a surface that no longer exists.
 *
 * This checks the document against the build: every export named in
 * `docs/versioning.md` must exist, and every export that exists must be named.
 * The same failure mode that put "all normal public APIs are gated as dual
 * ESM/CommonJS exports" into the release-readiness policy, where it stayed wrong
 * for two releases, applies to every table in that file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = fs.readFileSync(path.join(packageRoot, "docs", "versioning.md"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {
  exports: Record<string, unknown>;
};
const distExists = fs.existsSync(path.join(packageRoot, "dist"));

/** Resolve a subpath's ESM target from the manifest, the way a bundler would. */
function esmTarget(subpath: string): string | null {
  const walk = (node: unknown): string | null => {
    if (typeof node === "string") return node;
    if (!node || typeof node !== "object") return null;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "types") continue;
      if (key === "default" || key === "import" || key === "node") {
        const found = walk(value);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(manifest.exports[subpath]);
}

/**
 * Rows of the entry-point table whose "covered exports" cell is a list of
 * backticked identifiers. Rows written as prose (the preset factories, the
 * jest-compat runtime shims, the types-only entry) are handled separately.
 */
function documentedEntryRows(): Array<{ subpath: string; exports: string[] }> {
  const rows: Array<{ subpath: string; exports: string[] }> = [];
  for (const line of doc.split("\n")) {
    const match = /^\|\s*`(vitest-native[^`]*)`\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (!match) continue;
    const [, specifier, cell] = match;
    // Only cells that are purely a comma-separated list of code spans.
    if (!/^`[^`]+`(?:,\s*`[^`]+`)*$/.test(cell)) continue;
    const subpath =
      specifier === "vitest-native" ? "." : `./${specifier.split("/").slice(1).join("/")}`;
    rows.push({ subpath, exports: [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]).sort() });
  }
  return rows;
}

async function actualExports(subpath: string): Promise<string[]> {
  const target = esmTarget(subpath);
  if (!target) throw new Error(`no ESM target for ${subpath}`);
  const mod = (await import(pathToFileURL(path.join(packageRoot, target)).href)) as Record<
    string,
    unknown
  >;
  return Object.keys(mod)
    .filter((k) => k !== "default")
    .sort();
}

describe("versioning contract matches the build", () => {
  it("finds entry rows to check, so the assertions below are not vacuous", () => {
    const rows = documentedEntryRows();
    expect(rows.length).toBeGreaterThanOrEqual(5);
    // Every listed subpath must actually be exported by the manifest.
    const undeclared = rows.filter((r) => !(r.subpath in manifest.exports)).map((r) => r.subpath);
    expect(undeclared, "documented but not in the exports map").toEqual([]);
  });

  it.runIf(distExists)("names exactly the exports each documented entry point has", async () => {
    const mismatches: string[] = [];
    for (const { subpath, exports: documented } of documentedEntryRows()) {
      const actual = await actualExports(subpath);
      const missing = actual.filter((e) => !documented.includes(e));
      const extra = documented.filter((e) => !actual.includes(e));
      if (missing.length > 0) {
        mismatches.push(`${subpath}: exported but undocumented — ${missing.join(", ")}`);
      }
      if (extra.length > 0) {
        mismatches.push(`${subpath}: documented but not exported — ${extra.join(", ")}`);
      }
    }
    expect(mismatches, `docs/versioning.md is out of date:\n${mismatches.join("\n")}`).toEqual([]);
  });

  it.runIf(distExists)("states the right number of preset factories", async () => {
    const stated = /the (\d+) preset factories/.exec(doc);
    expect(stated, "the preset row no longer states a count").not.toBeNull();
    const actual = await actualExports("./presets");
    expect(Number(stated![1]), `docs say ${stated![1]}, build has ${actual.length}`).toBe(
      actual.length,
    );
  });

  it("names exactly the plugin options the validator accepts", async () => {
    // The validator rejects unknown keys, so its list is the real option surface.
    const validate = fs.readFileSync(path.join(packageRoot, "src", "validate.ts"), "utf8");
    const block = /const KNOWN_OPTIONS = \[([\s\S]*?)\]/.exec(validate);
    expect(block, "KNOWN_OPTIONS not found in validate.ts").not.toBeNull();
    const accepted = [...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();

    const documentedLine = doc
      .split("\n")
      .find((l) => l.includes("keys accepted by the plugin function"));
    expect(documentedLine, "the plugin-options sentence moved or lost its list").toBeDefined();
    // The sentence continues onto following lines; take the whole paragraph.
    const paragraph = doc.slice(doc.indexOf(documentedLine!)).split("\n\n")[0];
    const documented = [...paragraph.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1])
      // Option names are bare identifiers; anything with parentheses is a
      // function being referred to in prose, not an option.
      .filter((name) => !name.includes("("))
      .sort();

    expect(documented, "docs/versioning.md plugin options differ from KNOWN_OPTIONS").toEqual(
      accepted,
    );
  });
});
