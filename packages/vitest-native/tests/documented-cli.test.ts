import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMMAND_FLAGS } from "../src/cli/index";

// The CLI page documents each command under its own `## \`command\`` heading. `compare`
// shipped without one, so the page listed three commands of four. Each command the CLI
// accepts now needs a section, and each of its flags must be named in that section.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = path.resolve(packageRoot, "../../website/guide/cli.md");

/** Each `## \`command\`` section of the page, by command. */
function sections(page: string): Map<string, string> {
  const parts = page.split(/^## `([\w-]+)`$/m);
  const result = new Map<string, string>();
  for (let i = 1; i < parts.length; i += 2) result.set(parts[i], parts[i + 1]);
  return result;
}

/** The flags a section names, as whole tokens: `--json` is not found inside `--jest-results`. */
const named = (text: string) => new Set(text.match(/--[a-z][\w-]*/g) ?? []);

describe("website/guide/cli.md", () => {
  const documented = sections(fs.readFileSync(PAGE, "utf8"));

  it("has one section for each command, and no other", () => {
    expect([...documented.keys()].sort()).toEqual(Object.keys(COMMAND_FLAGS).sort());
  });

  it("names each command's flags in its section", () => {
    // --root is shared by every command and documented once, at the top of the page.
    const flags = Object.entries(COMMAND_FLAGS).flatMap(([name, list]) =>
      list.filter((flag) => flag !== "--root").map((flag) => [name, flag] as const),
    );
    expect(flags.length).toBeGreaterThanOrEqual(12);
    for (const [name, flag] of flags) {
      expect(named(documented.get(name) ?? ""), `${name} ${flag}`).toContain(flag);
    }
  });
});
