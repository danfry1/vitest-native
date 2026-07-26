/**
 * The documented configuration block has to behave like the documentation says.
 *
 * `plugin-options.md` opens with "All options are optional. `reactNative()` with no
 * arguments works for any real RN app" and then shows every option written out, which
 * reads as the defaults spelled in full. One line made it materially different:
 *
 *     presets: [],           // Third-party library presets
 *
 * `resolveOptions` branches on `if (options.presets)`, and `[]` is truthy, so
 * providing it REPLACES auto-detection rather than restating it. Copying the block
 * silently disabled every preset — reanimated, gesture-handler, navigation, expo,
 * flash-list, bottom-sheet, keyboard-controller, safe-area-context, worklets,
 * vector-icons — in a config that looked like the defaults. The failure surfaces far
 * from its cause, as a third-party library that mysteriously does not work.
 *
 * Prose next to a snippet cannot be checked, so this executes the snippet: it is
 * parsed out of the published page, run through the plugin, and required to resolve
 * the same presets as `reactNative()`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { reactNative } from "../src/index.js";

const docPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "website",
  "guide",
  "plugin-options.md",
);

/** Pull the documented `reactNative({ ... })` options object out of the page. */
function documentedOptions(): Record<string, unknown> {
  const page = fs.readFileSync(docPath, "utf8");
  const call = /reactNative\((\{[\s\S]*?\n\})\)/.exec(page);
  if (!call) throw new Error(`No reactNative({...}) block found in ${docPath}`);
  const literal = call[1];

  // The block is a copy-pasteable defaults reference, so every value must be a
  // plain literal. Requiring that is part of what this test checks — and it keeps
  // evaluation confined to data, since anything callable is rejected before it
  // runs. (The source is a repo-committed page, not user input, but a defaults
  // block containing executable code would be a documentation bug regardless.)
  const executable = /`|=>|\bfunction\b|\brequire\b|\bimport\b|[A-Za-z_$][\w$]*\s*\(/;
  const withoutComments = literal.replace(/\/\/[^\n]*/g, "");
  if (executable.test(withoutComments)) {
    throw new Error(
      `The documented options block is not literal-only, so a reader cannot copy it as shown:\n${literal}`,
    );
  }
  return JSON.parse(
    withoutComments
      .replace(/'/g, '"')
      .replace(/,(\s*[}\]])/g, "$1")
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":'),
  ) as Record<string, unknown>;
}

async function activePresets(options?: Record<string, unknown>): Promise<string[]> {
  const plugin = reactNative(options as never) as unknown as {
    configResolved: (config: { root: string }) => Promise<void>;
    config: (config: unknown, env: unknown) => Promise<{ test?: { env?: Record<string, string> } }>;
  };
  await plugin.configResolved({ root: process.cwd() });
  const resolved = await plugin.config({ test: {} }, { command: "serve" });
  const names = resolved?.test?.env?.VITEST_NATIVE_PRESET_NAMES;
  return names ? (JSON.parse(names) as string[]) : [];
}

describe("the documented configuration block", () => {
  it("is a self-contained snippet a reader can copy", () => {
    expect(() => documentedOptions()).not.toThrow();
  });

  it("resolves the same presets as calling reactNative() with no arguments", async () => {
    const auto = await activePresets();
    // Without this the assertion passes vacuously if auto-detection ever returns
    // nothing — the documented block would then "agree" by both being empty.
    expect(auto.length).toBeGreaterThan(0);
    expect(await activePresets(documentedOptions())).toEqual(auto);
  });

  it("does not disable auto-detection by documenting an empty preset array", async () => {
    // The specific regression: `presets: []` is truthy, so it replaces detection.
    expect(documentedOptions()).not.toHaveProperty("presets");
    expect(await activePresets({ presets: [] })).toEqual([]);
  });
});
