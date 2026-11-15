import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults } from "vitest/config";
import { describe, expect, it, vi } from "vitest";

// website/guide/writing-tests.md states two defaults of the libraries it teaches: how long
// `findBy…` waits, and that Vitest clears mock calls before every test. Both come from
// the installed packages, read here, so a release that changes either fails this test
// instead of leaving the page wrong. It also says which call undoes which mock state
// between tests, checked here against the installed Vitest.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE = path.join(repoRoot, "website/guide/writing-tests.md");
const page = fs.readFileSync(PAGE, "utf8").replace(/\s+/g, " ");
const require = createRequire(import.meta.url);

/** The installed Testing Library's default `asyncUtilTimeout` (14 ships dist/, 13 build/). */
function rntlAsyncUtilTimeout(): number {
  const root = path.dirname(require.resolve("@testing-library/react-native/package.json"));
  const config = ["dist", "build"]
    .map((dir) => path.join(root, dir, "config.js"))
    .find((file) => fs.existsSync(file));
  if (!config) throw new Error(`no config.js under ${root}`);
  const { getConfig } = require(config) as { getConfig(): { asyncUtilTimeout: number } };
  return getConfig().asyncUtilTimeout;
}

describe("writing-tests.md: the defaults it states", () => {
  it("findBy waits as long as the installed Testing Library's default", () => {
    const claim = /for up to (a|\d+) seconds? by default/.exec(page);
    expect(claim, "the page no longer states findBy's default wait").not.toBeNull();
    const seconds = claim![1] === "a" ? 1 : Number(claim![1]);
    expect(seconds * 1000).toBe(rntlAsyncUtilTimeout());
  });

  it("clearMocks matches the installed Vitest's default", () => {
    const claim =
      /Vitest (\d+) clears mock calls before every test \(`clearMocks: (true|false)`\)/.exec(page);
    expect(claim, "the page no longer states the clearMocks default").not.toBeNull();
    const { version } = require("vitest/package.json") as { version: string };
    expect(claim![1]).toBe(version.split(".")[0]);
    expect(claim![2]).toBe(String(configDefaults.clearMocks));
  });
});

describe("writing-tests.md: what resetting and restoring undo", () => {
  it("restoreAllMocks puts a spy back but leaves a vi.fn's return value", () => {
    const fn = vi.fn().mockReturnValue("set");
    const target = { method: () => "real" };
    vi.spyOn(target, "method").mockReturnValue("spied");

    vi.restoreAllMocks();
    expect(target.method()).toBe("real");
    expect(fn()).toBe("set");
  });

  it("resetAllMocks resets a vi.fn's return value", () => {
    const fn = vi.fn().mockReturnValue("set");

    vi.resetAllMocks();
    expect(fn()).toBeUndefined();
  });
});
