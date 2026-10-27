/**
 * `doctor` exists to diagnose broken projects, so a false "No blocking problems
 * found" is its worst possible failure. Two of them, both from the config check
 * being the substring test `content.includes("vitest-native")`:
 *
 *   - A config whose only mention was `// TODO: migrate to vitest-native` reported
 *     "uses vitest-native", on a project where every React Native import fails.
 *   - The file list omitted `vite.config.*`, which Vitest reads when there is no
 *     `vitest.config.*`. A correct setup was told to run `vitest-native init` —
 *     advice that creates a second config which then TAKES PRECEDENCE over the
 *     working one, so following it would have broken the project.
 *
 * Known limitation, deliberately not covered: a config that references the plugin
 * but cannot be parsed still reports as used. Establishing that would mean parsing
 * TypeScript, and esbuild is not resolvable from a project root under the current
 * Vite. An unparseable config fails loudly on the first `vitest` run, unlike the
 * two above, which fail silently.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { analyzeConfigUsage, runDoctor } from "../src/cli/doctor.js";

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

/** A throwaway project root containing the given config files. */
function project(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-doctor-"));
  roots.push(root);
  fs.writeFileSync(path.join(root, "package.json"), '{ "name": "p", "version": "1.0.0" }');
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}

/** The Config section of the report. */
function configLines(root: string): string {
  const { lines } = runDoctor(root, "22.13.0");
  return lines.slice(lines.lastIndexOf("Config")).join("\n");
}

describe("analyzeConfigUsage", () => {
  it("does not count a mention inside a line comment", () => {
    expect(analyzeConfigUsage("// TODO: migrate to vitest-native\nexport default {}")).toEqual({
      imports: false,
      invokes: false,
    });
  });

  it("does not count a mention inside a block comment", () => {
    expect(analyzeConfigUsage("/* uses vitest-native one day */\nexport default {}")).toEqual({
      imports: false,
      invokes: false,
    });
  });

  it("does not count an import that has been commented out", () => {
    // The case comment-stripping actually exists for. A bare mention is already
    // excluded by requiring an import statement; a commented-OUT import matches
    // that pattern textually, so without stripping this reports a plugin that is
    // switched off — which is exactly what someone debugging has just done.
    const source = `// import { reactNative } from "vitest-native";
export default { plugins: [] };`;
    expect(analyzeConfigUsage(source)).toEqual({ imports: false, invokes: false });
  });

  it("does not count an invocation that has been commented out", () => {
    const source = `import { reactNative } from "vitest-native";
export default { plugins: [/* reactNative() */] };`;
    expect(analyzeConfigUsage(source)).toEqual({ imports: true, invokes: false });
  });

  it("counts a real import that is invoked", () => {
    const source = `import { reactNative } from "vitest-native";
export default { plugins: [reactNative()] };`;
    expect(analyzeConfigUsage(source)).toEqual({ imports: true, invokes: true });
  });

  it("counts an aliased import invoked under its alias", () => {
    const source = `import { reactNative as rn } from "vitest-native";
export default { plugins: [rn({ engine: "mock" })] };`;
    expect(analyzeConfigUsage(source)).toEqual({ imports: true, invokes: true });
  });

  it("reports an import that is never invoked", () => {
    const source = `import { reactNative } from "vitest-native";
export default { plugins: [] };`;
    expect(analyzeConfigUsage(source)).toEqual({ imports: true, invokes: false });
  });

  it("handles the require form", () => {
    const source = `const { reactNative } = require("vitest-native");
module.exports = { plugins: [reactNative()] };`;
    expect(analyzeConfigUsage(source)).toEqual({ imports: true, invokes: true });
  });

  it("handles a namespace import", () => {
    const source = `import * as vn from "vitest-native";
export default { plugins: [vn.reactNative()] };`;
    expect(analyzeConfigUsage(source)).toEqual({ imports: true, invokes: true });
  });

  it("does not flag a config importing something else from the package", () => {
    // Judging how helpers are used is not this check's job; a false alarm on a
    // working project is worse than missing an exotic misuse.
    const source = `import { presets } from "vitest-native";
export default { plugins: [presets.reanimated()] };`;
    expect(analyzeConfigUsage(source).imports).toBe(true);
    expect(analyzeConfigUsage(source).invokes).toBe(true);
  });

  it("is not fooled by a URL containing a double slash", () => {
    const source = `// see https://example.com/vitest-native
import { reactNative } from "vitest-native";
export default { plugins: [reactNative()] };`;
    expect(analyzeConfigUsage(source)).toEqual({ imports: true, invokes: true });
  });
});

describe("doctor config discovery", () => {
  const WORKING = `import { reactNative } from "vitest-native";
export default { plugins: [reactNative()] };`;

  it("recognises a working setup configured from vite.config.ts", () => {
    const report = configLines(project({ "vite.config.ts": WORKING }));
    expect(report).toContain("vite.config.ts uses vitest-native");
    expect(report).not.toContain("run `vitest-native init`");
  });

  it("prefers vitest.config.* over vite.config.*, as Vitest does", () => {
    const report = configLines(project({ "vite.config.ts": WORKING, "vitest.config.ts": WORKING }));
    expect(report).toContain("vitest.config.ts uses vitest-native");
    expect(report).not.toContain("vite.config.ts uses");
  });

  it("does not claim a comment-only config uses the plugin", () => {
    const report = configLines(
      project({ "vitest.config.ts": "// TODO: migrate to vitest-native\nexport default {}" }),
    );
    expect(report).not.toContain("uses vitest-native.");
    expect(report).toContain("only mentioned in a comment");
  });

  it("still reports a missing config", () => {
    expect(configLines(project({}))).toContain("no vitest.config.* found");
  });
});
