/**
 * On Vitest 4 the plugin leaves Vitest's persistent transform cache off (it is
 * `experimental.fsModuleCache` there), so every run re-transforms every module. doctor
 * says so, and stays quiet where the plugin turns the cache on. Both read
 * fsModuleCacheOnByDefault, so the advisory cannot outlive a change to the default.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fsModuleCacheSetting, runDoctor, transformCacheAdvice } from "../src/cli/doctor.js";
import { fsModuleCacheOnByDefault } from "../src/fs-module-cache.js";

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

/** A project with this Vitest installed and, optionally, a vitest.config.ts. */
function project(vitest: string, config?: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-doctor-cache-"));
  roots.push(root);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
  const dir = path.join(root, "node_modules", "vitest");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "vitest", version: vitest }),
  );
  if (config !== undefined) fs.writeFileSync(path.join(root, "vitest.config.ts"), config);
  return root;
}

const PLAIN = `import { defineConfig } from 'vitest/config';
import { reactNative } from 'vitest-native';
export default defineConfig({ plugins: [reactNative()] });
`;
const withTest = (test: string) =>
  `import { defineConfig } from 'vitest/config';
import { reactNative } from 'vitest-native';
export default defineConfig({ plugins: [reactNative()], test: ${test} });
`;

/** The lines of doctor's "Transform cache" section, empty when it has none. */
function section(root: string): string[] {
  const { lines } = runDoctor(root, "24.13.0");
  const start = lines.indexOf("Transform cache");
  if (start === -1) return [];
  const end = lines.indexOf("", start);
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

const TROUBLESHOOTING = "guide/troubleshooting#cannot-find-module-keeps-failing";

describe("doctor: transform cache advisory", () => {
  it("on Vitest 4 without the option, says what it costs and how to turn it on", () => {
    const lines = section(project("4.1.5", PLAIN));
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.startsWith("  · "))).toBe(true);
    const text = lines.join("\n");
    expect(text).toContain("Vitest 4.1.5 re-transforms every imported module on each run");
    expect(text).toContain("about half a second per thousand imported modules");
    expect(text).toContain("Vitest 5 keeps transformed modules on disk");
    expect(text).toContain("set `test.experimental.fsModuleCache: true`");
    expect(text).toContain(TROUBLESHOOTING);
    expect(text).toContain("unverified on 4");
  });

  it("offers the option from Vitest 4.0.11, where it first exists", () => {
    expect(section(project("4.0.11", PLAIN))[1]).toContain(
      "set `test.experimental.fsModuleCache: true`",
    );
    const before = section(project("4.0.10", PLAIN));
    expect(before).toHaveLength(2);
    expect(before[1]).toContain("Vitest 4.0.11 adds `test.experimental.fsModuleCache`");
    expect(before[1]).not.toContain("set `test.experimental");
  });

  it("is advisory: it never makes doctor report a blocking problem", () => {
    // The fixture lacks other peers, so compare with the same project on Vitest 5.
    const verdict = (vitest: string) => runDoctor(project(vitest, PLAIN), "24.13.0").ok;
    expect(verdict("4.1.5")).toBe(verdict("5.0.5"));
  });

  it("with the option set, shows the caveat without claiming the cache is on", () => {
    const lines = section(project("4.1.5", withTest("{ experimental: { fsModuleCache: true } }")));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("the config sets `experimental.fsModuleCache`; while it is on,");
    expect(lines[0]).toContain(TROUBLESHOOTING);
    expect(lines[0]).not.toContain("re-transforms");
  });

  it("with the option turned off, says nothing", () => {
    expect(
      section(project("4.1.5", withTest("{ experimental: { fsModuleCache: false } }"))),
    ).toEqual([]);
  });

  it("on Vitest 4, names the top-level spelling as Vitest 5's, with no effect", () => {
    const lines = section(project("4.1.5", withTest("{ fsModuleCache: true }")));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("re-transforms");
    expect(lines[1]).toContain("`test.fsModuleCache`, the Vitest 5 spelling");
    expect(lines[1]).toContain("no effect on Vitest 4");
    expect(section(project("4.1.5", withTest("{ fsModuleCache: false }")))).toHaveLength(3);
  });

  it("on Vitest 5 says nothing, where the plugin turns the cache on", () => {
    expect(section(project("5.0.5", PLAIN))).toEqual([]);
    expect(section(project("5.0.5"))).toEqual([]);
  });

  it("is empty exactly on the majors fsModuleCacheOnByDefault turns the cache on for", () => {
    for (const major of [4, 5, 6]) {
      expect(transformCacheAdvice(`${major}.0.11`, PLAIN).length === 0).toBe(
        fsModuleCacheOnByDefault(major),
      );
    }
    expect(transformCacheAdvice(null, PLAIN)).toEqual([]);
    expect(transformCacheAdvice("3.2.4", PLAIN)).toEqual([]);
  });
});

describe("fsModuleCacheSetting", () => {
  it.each([
    [PLAIN, null, null],
    [withTest("{ fsModuleCache: false }"), null, "off"],
    [withTest("{ fsModuleCache: true }"), null, "set"],
    [withTest("{ experimental: { fsModuleCache: true } }"), "set", null],
    [withTest("{ experimental: { fsModuleCache: false } }"), "off", null],
    [withTest("{ experimental: { other: 1, fsModuleCache: !process.env.CI } }"), "set", null],
    [withTest("{ fsModuleCache: false, experimental: { fsModuleCache: true } }"), "set", "off"],
    [`// test: { experimental: { fsModuleCache: true } }\n${PLAIN}`, null, null],
  ] as const)("%#", (source, experimental, topLevel) => {
    expect(fsModuleCacheSetting(source)).toEqual({ experimental, topLevel });
  });
});
