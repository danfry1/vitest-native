import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { inDirectory } from "../src/jest-compat/caller.mjs";

// The shim skips its own stack frames by directory. On Windows the two sides of that
// comparison arrive in different shapes — Vite's module runner reports frames as
// `D:/a/b/setup.mjs`, fileURLToPath yields `D:\a\b` — and a plain comparison treated
// the shim's own frames as the caller, so relative requireActual specifiers resolved
// against the shim. These run the Windows rules on any platform.
describe("inDirectory", () => {
  it("matches a Windows frame regardless of separators and drive-letter case", () => {
    expect(
      inDirectory(
        "D:/a/pkg/dist/jest-compat/setup.mjs",
        "D:\\a\\pkg\\dist\\jest-compat",
        path.win32,
      ),
    ).toBe(true);
    expect(
      inDirectory(
        "d:\\a\\pkg\\dist\\jest-compat\\setup.mjs",
        "D:\\a\\pkg\\dist\\jest-compat",
        path.win32,
      ),
    ).toBe(true);
  });

  it("does not match a user file in a directory that merely shares the name", () => {
    expect(
      inDirectory(
        "D:/a/app/jest-compat/caller.test.ts",
        "D:\\a\\pkg\\dist\\jest-compat",
        path.win32,
      ),
    ).toBe(false);
    expect(
      inDirectory("/a/app/jest-compat/caller.test.ts", "/a/pkg/dist/jest-compat", path.posix),
    ).toBe(false);
  });

  it("matches only direct children, case-sensitively on POSIX", () => {
    expect(
      inDirectory("/a/pkg/dist/jest-compat/setup.mjs", "/a/pkg/dist/jest-compat", path.posix),
    ).toBe(true);
    expect(
      inDirectory("/a/pkg/dist/jest-compat/x/y.mjs", "/a/pkg/dist/jest-compat", path.posix),
    ).toBe(false);
    expect(
      inDirectory("/a/pkg/dist/Jest-Compat/setup.mjs", "/a/pkg/dist/jest-compat", path.posix),
    ).toBe(false);
  });
});
