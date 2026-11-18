import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";

// End to end: jestMockTransform() under Vitest's default `globals: false` (#818). The
// transform rewrites `jest.mock` to a Vitest call that must reach `vi` without a global,
// whatever the file itself imports from 'vitest' or names `vi`, and every line of the file
// must keep its number in a stack trace.
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const built = fs.existsSync(path.join(PACKAGE_ROOT, "dist/jest-compat.mjs"));

function write(root: string, rel: string, text: string) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

// Each file's own jest.mock of ./api, which must apply.
const MOCKED = `jest.mock("./api", () => ({ other: () => "mocked" }));\n`;
const FILES: Record<string, string> = {
  // The issue's file: it imports from 'vitest', but not `vi`.
  "imports-vitest.test.ts":
    `import { expect, test } from "vitest";\nimport { other } from "./api";\n${MOCKED}` +
    `test("applies", () => expect(other()).toBe("mocked"));\n`,
  // `vi` imported under another name: the local `v` and the transform's `vi` are one object.
  "aliased.test.ts":
    `import { expect, test, vi as v } from "vitest";\nimport { other } from "./api";\n${MOCKED}` +
    `test("applies", () => {\n  expect(other()).toBe("mocked");\n  expect(v.isMockFunction(v.fn())).toBe(true);\n});\n`,
  // The file's own top-level `vi` is something else, and stays its own.
  "own-vi.test.ts":
    `import { expect, test } from "vitest";\nimport { other } from "./api";\n` +
    `const vi = { mine: true };\n${MOCKED}` +
    `test("applies", () => {\n  expect(other()).toBe("mocked");\n  expect(vi).toEqual({ mine: true });\n});\n`,
  // A helper's `vi` parameter shadows nothing the transform writes.
  "param-vi.test.ts":
    `import { expect, test } from "vitest";\n` +
    `const load = async (vi: unknown) => {\n  jest.doMock("./api", () => ({ other: () => vi }));\n  return (await import("./api")).other();\n};\n` +
    `test("applies", async () => expect(await load("mine")).toBe("mine"));\n`,
  // `vi` imported as itself: nothing added.
  "imports-vi.test.ts":
    `import { expect, test, vi } from "vitest";\nimport { other } from "./api";\n${MOCKED}` +
    `test("applies", () => {\n  expect(other()).toBe("mocked");\n  expect(vi.isMockFunction(vi.fn())).toBe(true);\n});\n`,
  // Line 6 of the source is line 6 in a stack trace, after the factory's accessor and the
  // import the transform adds.
  "lines.test.ts":
    `import { expect, test } from "vitest";\nimport { other } from "./api";\n${MOCKED}\n` +
    `test("keeps lines", () => {\n  const stack = new Error("here").stack ?? "";\n` +
    `  expect(stack).toMatch(/lines\\.test\\.ts:6:\\d+/);\n  expect(other()).toBe("mocked");\n});\n`,
};

describe("jestMockTransform with globals: false (#818)", () => {
  it("needs dist", () => {
    expect(built, "run `bun run build` before this suite — CI builds first").toBe(true);
  });

  it.runIf(built)(
    "applies jest.mock in every file, binding vi itself, with lines unchanged",
    () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-jest-mock-globals-"));
      // Installed as in an app: the setup is a bare `vitest-native/…` request, and it loads
      // react-native. Every dependency of this package is linked beside it.
      const modules = path.join(root, "node_modules");
      fs.mkdirSync(modules);
      const link = (target: string, name: string) =>
        fs.symlinkSync(
          fs.realpathSync(target),
          path.join(modules, name),
          process.platform === "win32" ? "junction" : "dir",
        );
      const installed = path.join(PACKAGE_ROOT, "node_modules");
      for (const name of fs.readdirSync(installed)) {
        if (!name.startsWith(".")) link(path.join(installed, name), name);
      }
      link(PACKAGE_ROOT, "vitest-native");
      write(
        root,
        "package.json",
        `{ "name": "jest-mock-globals", "private": true, "type": "module" }\n`,
      );
      write(
        root,
        "vitest.config.mjs",
        `import { defineConfig } from "vitest/config";\n` +
          `import { reactNative } from "vitest-native";\n` +
          `import { jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";\n` +
          `export default defineConfig({\n` +
          `  plugins: [jestMockTransform(), reactNative({ hotRuntime: false })],\n` +
          // globals left at its default, false.
          `  test: { include: ["*.test.ts"], setupFiles: [jestCompatSetup] },\n` +
          `});\n`,
      );
      write(root, "api.ts", `export const other = (): unknown => "real";\n`);
      for (const [name, text] of Object.entries(FILES)) write(root, name, text);

      const vitestBin = path.join(modules, "vitest", "vitest.mjs");
      // This suite runs inside Vitest; none of its worker state may reach the child.
      const env: Record<string, string | undefined> = { ...process.env, CI: "1" };
      for (const key of Object.keys(env)) {
        if (key.startsWith("VITEST") || key === "NODE_OPTIONS" || key === "NODE_PATH") {
          delete env[key];
        }
      }
      const child = spawnSync(process.execPath, [vitestBin, "run", "--reporter=verbose"], {
        cwd: root,
        encoding: "utf8",
        env,
        timeout: 120_000,
      });
      const output = stripVTControlCharacters(`${child.stdout}\n${child.stderr}`);
      expect(output).not.toMatch(/vi is not defined/);
      const count = Object.keys(FILES).length;
      expect(output).toMatch(new RegExp(`Test Files\\s+${count} passed \\(${count}\\)`));
      expect(child.status, output).toBe(0);
    },
    150_000,
  );
});
