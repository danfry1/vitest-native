/**
 * The Expo SDK a test loads (checkLoadedExpoSdk in native/hooks.mjs).
 *
 * The plugin checks the `expo` that resolves from the project. A library that uses an
 * Expo module without `expo` of its own resolves none, and on an older SDK failed inside
 * expo-modules-core with nothing naming the cause. The native engine's require hook now
 * reads the version of the expo-modules-core or expo a test actually loads. Reaching a
 * copy in the dependency tree is not enough: an optional peer reaches whatever expo the
 * package manager hoisted, which the tests may never load.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactNative } from "../src/index.js";
import {
  _resetExpoSdkChecks,
  checkLoadedExpoSdk,
  resetExpoSdkWarnings,
} from "../src/native/hooks.mjs";
import { SUPPORTED_EXPO_SDKS } from "../src/peer-requirements.js";
import { contextOf } from "./project-context-helpers.js";
import { runPluginConfig } from "./plugin-config.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fromPackage = createRequire(path.join(PACKAGE_ROOT, "package.json"));
const SDKS: [number, number] = [SUPPORTED_EXPO_SDKS.minimum, SUPPORTED_EXPO_SDKS.maximum];
const temps: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  _resetExpoSdkChecks();
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A directory of installed packages, `name@version` each, under node_modules/. */
function installed(...packages: string[]): string {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-expo-loaded-"));
  temps.push(root);
  for (const id of packages) {
    const at = id.lastIndexOf("@");
    const dir = path.join(root, "node_modules", id.slice(0, at));
    fs.mkdirSync(path.join(dir, "build"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: id.slice(0, at), version: id.slice(at + 1), main: "build/index.js" }),
    );
    fs.writeFileSync(path.join(dir, "build", "index.js"), "module.exports = {};");
  }
  return root;
}

const fileOf = (root: string, pkg: string, file = "build/index.js") =>
  `${root.replace(/\\/g, "/")}/node_modules/${pkg}/${file}`;

function warnings() {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  return () => warn.mock.calls.map((call) => String(call[0]));
}

describe("loading expo-modules-core or expo", () => {
  it("warns once about expo-modules-core from SDK 54 or older, naming its version and path", () => {
    const root = installed("expo-modules-core@3.0.29");
    const warned = warnings();
    checkLoadedExpoSdk(fileOf(root, "expo-modules-core"), SDKS);
    checkLoadedExpoSdk(fileOf(root, "expo-modules-core", "build/Platform.js"), SDKS);
    expect(warned()).toEqual([
      `[vitest-native] expo-modules-core 3.0.29 (${path.join(root, "node_modules", "expo-modules-core")}) is ` +
        "from Expo SDK 54 or older; vitest-native supports Expo SDK 57 and 58. Tests that load " +
        "it can fail: upgrade to a supported Expo SDK.",
    ]);
  });

  it("reads expo-modules-core's SDK from its major from SDK 55 on, and expo's always", () => {
    const root = installed("expo-modules-core@56.0.15", "expo@55.0.4");
    const first = installed("expo-modules-core@55.0.27");
    const warned = warnings();
    checkLoadedExpoSdk(fileOf(first, "expo-modules-core"), SDKS);
    checkLoadedExpoSdk(fileOf(root, "expo-modules-core"), SDKS);
    checkLoadedExpoSdk(fileOf(root, "expo", "build/Expo.js"), SDKS);
    expect(warned()).toEqual([
      expect.stringMatching(
        /^\[vitest-native\] expo-modules-core 55\.0\.27 \(.*\) is from Expo SDK 55;/,
      ),
      expect.stringMatching(
        /^\[vitest-native\] expo-modules-core 56\.0\.15 \(.*\) is from Expo SDK 56;/,
      ),
      expect.stringMatching(/^\[vitest-native\] expo 55\.0\.4 \(.*\) is from Expo SDK 55;/),
    ]);
  });

  it("says a newer SDK needs a newer vitest-native", () => {
    const root = installed("expo-modules-core@59.0.1");
    const warned = warnings();
    checkLoadedExpoSdk(fileOf(root, "expo-modules-core"), SDKS);
    expect(warned()).toEqual([
      expect.stringMatching(/is from Expo SDK 59; .* Check for a newer vitest-native\.$/),
    ]);
  });

  it("is silent about supported copies", () => {
    const root = installed("expo-modules-core@57.0.24", "expo@58.0.20");
    const warned = warnings();
    checkLoadedExpoSdk(fileOf(root, "expo-modules-core"), SDKS);
    checkLoadedExpoSdk(fileOf(root, "expo", "build/Expo.js"), SDKS);
    expect(warned()).toEqual([]);
  });

  it("names each unsupported copy a worker loads", () => {
    const a = installed("expo-modules-core@3.0.29");
    const b = installed("expo-modules-core@2.5.0");
    const warned = warnings();
    checkLoadedExpoSdk(fileOf(a, "expo-modules-core"), SDKS);
    checkLoadedExpoSdk(fileOf(b, "expo-modules-core"), SDKS);
    expect(warned()).toHaveLength(2);
  });

  it("does not take another package's file for Expo's", () => {
    // A package nested in expo's node_modules, and one whose name starts with "expo".
    const root = installed("expo@54.0.33", "expo-image@3.0.11");
    const warned = warnings();
    checkLoadedExpoSdk(fileOf(root, "expo", "node_modules/expo-asset/build/index.js"), SDKS);
    checkLoadedExpoSdk(fileOf(root, "expo-image"), SDKS);
    expect(warned()).toEqual([]);
  });

  it("is off without the supported range, as under the mock engine", () => {
    const root = installed("expo-modules-core@3.0.29");
    const warned = warnings();
    checkLoadedExpoSdk(fileOf(root, "expo-modules-core"), undefined);
    expect(warned()).toEqual([]);
  });
});

describe("a later test file in the same worker", () => {
  it("is warned again, from the version already read", () => {
    const root = installed("expo-modules-core@3.0.29");
    const warned = warnings();
    const read = vi.spyOn(fs, "readFileSync");
    checkLoadedExpoSdk(fileOf(root, "expo-modules-core"), SDKS);
    resetExpoSdkWarnings(); // the hot runtime's per-file reset
    checkLoadedExpoSdk(fileOf(root, "expo-modules-core"), SDKS);
    expect(warned()).toHaveLength(2);
    expect(read.mock.calls.filter(([file]) => String(file).endsWith("package.json"))).toHaveLength(
      1,
    );
  });
});

describe("what the check costs a load", () => {
  function count(run: () => void) {
    const read = vi.spyOn(fs, "readFileSync");
    const stat = vi.spyOn(fs, "statSync");
    const exists = vi.spyOn(fs, "existsSync");
    run();
    return {
      reads: read.mock.calls.length,
      stats: stat.mock.calls.length + exists.mock.calls.length,
    };
  }

  it("is nothing for a file of any other package", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const root = installed("expo-image@3.0.11", "react-native-svg@15.0.0");
    const files = [
      fileOf(root, "expo-image"),
      fileOf(root, "react-native-svg", "lib/index.js"),
      `${root}/src/App.tsx`,
      fileOf(root, "expo", "node_modules/expo-asset/build/index.js"),
    ];
    expect(count(() => files.forEach((file) => checkLoadedExpoSdk(file, SDKS)))).toEqual({
      reads: 0,
      stats: 0,
    });
  });

  it("is one package.json read per Expo package directory per worker", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const root = installed("expo-modules-core@3.0.29", "expo@58.0.20");
    const files = ["build/index.js", "build/a.js", "build/b.js", "src/c.ts"].flatMap((file) => [
      fileOf(root, "expo-modules-core", file),
      fileOf(root, "expo", file),
    ]);
    expect(count(() => files.forEach((file) => checkLoadedExpoSdk(file, SDKS)))).toEqual({
      reads: 2,
      stats: 0,
    });
  });
});

describe("the supported range the worker is given", () => {
  it("is SUPPORTED_EXPO_SDKS, under the native engine only", async () => {
    vi.stubEnv("VITEST_NATIVE_NO_REGISTRY", "1");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const root = PACKAGE_ROOT;
    expect(
      contextOf(await runPluginConfig(reactNative({ engine: "native" }), { root })).expoSdks,
    ).toEqual(SDKS);
    expect(
      contextOf(await runPluginConfig(reactNative({ engine: "mock" }), { root })).expoSdks,
    ).toBeUndefined();
  });
});

describe("expo-modules-core's major is its Expo SDK from SDK 55", () => {
  // Checked against every expo installed here, whichever SDKs those are.
  const store = path.join(PACKAGE_ROOT, "../../node_modules/.bun");
  const expoDirs = [
    path.dirname(fromPackage.resolve("expo/package.json")),
    ...(fs.existsSync(store) ? fs.readdirSync(store) : [])
      .filter((entry) => entry.startsWith("expo@"))
      .map((entry) => path.join(store, entry, "node_modules", "expo")),
  ]
    .map((dir) => fs.realpathSync(dir))
    .filter((dir, index, all) => all.indexOf(dir) === index)
    .map((dir) => {
      const { version } = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as {
        version: string;
      };
      return { dir, version, sdk: Number(version.split(".")[0]) };
    })
    .filter(({ sdk }) => sdk >= 55);

  it.skipIf(expoDirs.length === 0)(
    "in each installed expo's bundledNativeModules.json, and the expo-modules-core it installs",
    () => {
      for (const { dir, version, sdk } of expoDirs) {
        const bundled = JSON.parse(
          fs.readFileSync(path.join(dir, "bundledNativeModules.json"), "utf8"),
        ) as Record<string, string>;
        expect(bundled["expo-modules-core"], `expo ${version}`).toMatch(
          new RegExp(`^[~^]?${sdk}\\.`),
        );
        const core = createRequire(path.join(dir, "package.json")).resolve(
          "expo-modules-core/package.json",
        );
        const { version: coreVersion } = JSON.parse(fs.readFileSync(core, "utf8")) as {
          version: string;
        };
        expect(Number(coreVersion.split(".")[0]), `expo ${version}`).toBe(sdk);
      }
    },
  );
});
