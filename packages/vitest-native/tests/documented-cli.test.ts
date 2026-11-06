import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMPARE_SWITCHES, COMPARE_VALUED_FLAGS } from "../src/cli/compare-run";

// The CLI page documents each command under its own `## \`command\`` heading. `compare`
// shipped without one, so the page listed three commands of four. Each command the CLI
// accepts now needs a section, and each of its flags must be named in that section.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = path.resolve(packageRoot, "../../website/guide/cli.md");

/** Each command and its flags, from COMMAND_FLAGS in src/cli/index.ts. */
function commands(): Map<string, string[]> {
  const source = fs.readFileSync(path.join(packageRoot, "src/cli/index.ts"), "utf8");
  const block = /const COMMAND_FLAGS[^=]*= \{([\s\S]*?)\n\};/.exec(source)?.[1] ?? "";
  const result = new Map<string, string[]>();
  for (const [, name, flags] of block.matchAll(/^\s+(\w+): \[(.*)\],$/gm)) {
    result.set(
      name,
      flags.includes("COMPARE_")
        ? [...COMPARE_VALUED_FLAGS, ...COMPARE_SWITCHES].filter((f) => f !== "--root")
        : [...flags.matchAll(/"(--[\w-]+)"/g)].map(([, flag]) => flag),
    );
  }
  return result;
}

/** Each `## \`command\`` section of the page, by command. */
function sections(page: string): Map<string, string> {
  const parts = page.split(/^## `([\w-]+)`$/m);
  const result = new Map<string, string>();
  for (let i = 1; i < parts.length; i += 2) result.set(parts[i], parts[i + 1]);
  return result;
}

describe("website/guide/cli.md", () => {
  const declared = commands();
  const documented = sections(fs.readFileSync(PAGE, "utf8"));

  it("reads the commands from the CLI", () => {
    // An empty read would make the checks below vacuous.
    expect([...declared.keys()]).toEqual(expect.arrayContaining(["init", "migrate", "compare"]));
    expect(declared.get("compare")?.length).toBeGreaterThanOrEqual(8);
  });

  it("has one section for each command, and no other", () => {
    expect([...documented.keys()].sort()).toEqual([...declared.keys()].sort());
  });

  it("names each command's flags in its section", () => {
    for (const [name, flags] of declared) {
      for (const flag of flags) expect(documented.get(name), `${name} ${flag}`).toContain(flag);
    }
  });
});
