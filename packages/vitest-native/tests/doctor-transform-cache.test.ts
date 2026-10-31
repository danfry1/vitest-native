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

describe("doctor: transform cache advisory", () => {
  it("on Vitest 4 without the option, says what it costs and how to turn it on", () => {
    const lines = section(project("4.1.5", PLAIN));
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.startsWith("  · "))).toBe(true);
    const text = lines.join("\n");
    expect(text).toContain("Vitest 4.1.5 re-transforms every imported module on each run");
    expect(text).toContain("about half a second per thousand imported modules");
    expect(text).toContain("Vitest 5 keeps transformed modules on disk");
    expect(text).toContain("`test.experimental.fsModuleCache: true`");
    expect(text).toContain("https://github.com/vitest-dev/vitest/issues/11789");
  });

  it("is advisory: it never makes doctor report a blocking problem", () => {
    // The fixture lacks other peers, so compare with the same project on Vitest 5.
    const verdict = (vitest: string) => runDoctor(project(vitest, PLAIN), "24.13.0").ok;
    expect(verdict("4.1.5")).toBe(verdict("5.0.5"));
  });

  it("with the option set, shows the caveat instead", () => {
    const lines = section(project("4.1.5", withTest("{ experimental: { fsModuleCache: true } }")));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("the config sets `fsModuleCache`");
    expect(lines[0]).toContain("issues/11789");
    expect(lines[0]).not.toContain("re-transforms");
  });

  it("with the option turned off, says nothing", () => {
    expect(
      section(project("4.1.5", withTest("{ experimental: { fsModuleCache: false } }"))),
    ).toEqual([]);
  });

  it("on Vitest 5 says nothing, where the plugin turns the cache on", () => {
    expect(section(project("5.0.5", PLAIN))).toEqual([]);
    expect(section(project("5.0.5"))).toEqual([]);
  });

  it("follows the plugin's default, not a copy of it", () => {
    for (const major of [4, 5, 6]) {
      expect(transformCacheAdvice(`${major}.0.0`, PLAIN).length === 0).toBe(
        fsModuleCacheOnByDefault(major),
      );
    }
    expect(transformCacheAdvice(null, PLAIN)).toEqual([]);
    expect(transformCacheAdvice("3.2.4", PLAIN)).toEqual([]);
  });
});

describe("fsModuleCacheSetting", () => {
  it.each([
    [PLAIN, null],
    [withTest("{ fsModuleCache: false }"), "off"],
    [withTest("{ experimental: { fsModuleCache: true } }"), "set"],
    [withTest("{ experimental: { fsModuleCache: !process.env.CI } }"), "set"],
    [`// test: { experimental: { fsModuleCache: true } }\n${PLAIN}`, null],
  ] as const)("%#", (source, expected) => {
    expect(fsModuleCacheSetting(source)).toBe(expected);
  });
});
