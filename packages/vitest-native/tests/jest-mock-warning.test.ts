import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactNative } from "../src/index.js";

// The warning that a file calls jest.mock() without jestMockTransform(). Its advice is
// for the project's own files; it fired on vitest-native's own jest-compat setup (which
// implements jest.mock) and on the plugin source (which only names it), so a project
// using the jest-compat setup without the transform was told to fix a file it does not
// own.
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CALL = "jest.mock('./api');\nimport { fetchUser } from './api';\n";

async function pluginWithoutTransform() {
  const plugin = reactNative({ engine: "mock" }) as any;
  await plugin.configResolved({
    root: PACKAGE_ROOT,
    plugins: [{ name: "vite:something-else" }],
    test: {},
  });
  return plugin;
}

describe("the missing-jestMockTransform warning", () => {
  afterEach(() => vi.restoreAllMocks());

  it("warns once for a project file that calls jest.mock()", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plugin = await pluginWithoutTransform();
    plugin.transform(CALL, "/app/src/user.test.ts");
    plugin.transform(CALL, "/app/src/other.test.ts");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/\/app\/src\/user\.test\.ts calls jest\.mock\(\)/);
  });

  it("stays silent for dependencies and for vitest-native's own files", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plugin = await pluginWithoutTransform();
    plugin.transform(CALL, "/app/node_modules/some-lib/index.js");
    plugin.transform(CALL, "/app/node_modules/vitest-native/dist/jest-compat/setup.mjs");
    plugin.transform(CALL, path.join(PACKAGE_ROOT, "dist", "jest-compat", "setup.mjs"));
    plugin.transform(CALL, path.join(PACKAGE_ROOT, "src", "plugin.ts"));
    expect(warn).not.toHaveBeenCalled();
    // The project's own file still gets it.
    plugin.transform(CALL, "/app/src/user.test.ts");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("stays silent when jestMockTransform() is installed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plugin = reactNative({ engine: "mock" }) as any;
    await plugin.configResolved({
      root: PACKAGE_ROOT,
      plugins: [{ name: "vitest-native:jest-mock-hoist" }],
      test: {},
    });
    plugin.transform(CALL, "/app/src/user.test.ts");
    expect(warn).not.toHaveBeenCalled();
  });
});
