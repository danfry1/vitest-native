/**
 * The supported Expo SDKs, and what an unsupported one is told.
 *
 * vitest-native supports the Expo SDKs CI installs as packed apps (57 and 58). An older SDK
 * failed in Expo code with nothing naming the cause: on SDK 54, every Expo view threw
 * "Cannot read properties of undefined (reading 'viewManagersMetadata')". The plugin and
 * doctor now say which SDKs are supported. They warn rather than fail, because most of an
 * older SDK's tests still run. Which `expo` a project uses follows Node's resolution, so a
 * workspace library that uses no Expo package is not warned about another app's.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactNative } from "../src/index.js";
import { runDoctor } from "../src/cli/doctor.js";
import { detectEcosystemPackages, type ReachedCopy } from "../src/native/ecosystem.js";
import {
  EXPO_SDK_PACKAGES,
  expoSdkList,
  FIRST_SDK_NUMBERED_MODULES_CORE,
  installedExpoSdk,
  installedExpoVersion,
  SUPPORTED_EXPO_SDKS,
  unsupportedExpoSdkMessage as unsupportedMessage,
  type ExpoInstall,
} from "../src/peer-requirements.js";
import { expoWorkspace, removeWorkspaces, type ExpoWorkspace } from "./expo-fixtures.js";

const unsupportedExpoSdkMessage = (version: string) =>
  unsupportedMessage({ package: "expo", version, via: null });

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fromPackage = createRequire(path.join(PACKAGE_ROOT, "package.json"));
const REAL_REACT = path.dirname(fromPackage.resolve("react/package.json"));
const REAL_VITE = path.dirname(fromPackage.resolve("vite/package.json"));
const temps: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  removeWorkspaces();
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function project(files: Record<string, object>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-expo-sdk-"));
  temps.push(root);
  for (const [file, content] of Object.entries({ "package.json": { name: "app" }, ...files })) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(content));
  }
  return root;
}

const expo = (version: string) => ({
  "node_modules/expo/package.json": { name: "expo", version },
});
const reactNativeAt = (version: string) => ({
  "node_modules/react-native/package.json": { name: "react-native", version },
});

describe("the supported Expo SDKs", () => {
  it("are 57 and 58, the ones the packed Expo consumers install", () => {
    expect(SUPPORTED_EXPO_SDKS).toEqual({ minimum: 57, maximum: 58 });
    const sdkOf = (fixture: string) => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(PACKAGE_ROOT, "consumer-tests", fixture, "package.json"), "utf8"),
      ) as { dependencies: Record<string, string> };
      return Number(manifest.dependencies.expo.split(".")[0]);
    };
    expect([sdkOf("expo-sdk57"), sdkOf("expo")]).toEqual([57, 58]);
  });

  it("are stated in the Expo guide", () => {
    const guide = fs.readFileSync(path.join(PACKAGE_ROOT, "../../website/guide/expo.md"), "utf8");
    expect(guide).toContain("Expo SDK 57 and 58");
  });
});

describe("unsupportedExpoSdkMessage", () => {
  it("says nothing for a supported SDK", () => {
    expect(unsupportedExpoSdkMessage("57.0.24")).toBeNull();
    expect(unsupportedExpoSdkMessage("58.0.16")).toBeNull();
    expect(unsupportedExpoSdkMessage("58.0.0-canary-20261001-abc")).toBeNull();
  });

  it("names the supported SDKs and the ones to upgrade to", () => {
    const message = unsupportedExpoSdkMessage("54.0.33");
    expect(message).toContain("Expo SDK 54 (expo 54.0.33) is not supported");
    expect(message).toContain("vitest-native supports Expo SDK 57 and 58.");
    expect(message).toContain("Upgrade to Expo SDK 57 or 58;");
    expect(unsupportedExpoSdkMessage("56.0.9")).toContain(
      "Expo SDK 56 (expo 56.0.9) is not supported",
    );
  });

  it("says a newer SDK is not yet supported", () => {
    expect(unsupportedExpoSdkMessage("59.0.0")).toMatch(
      /^Expo SDK 59 \(expo 59\.0\.0\) is newer than this release supports: vitest-native supports Expo SDK 57 and 58\./,
    );
  });

  it("lists any number of SDKs", () => {
    expect(expoSdkList("and")).toBe("57 and 58");
    expect(expoSdkList("or", { minimum: 57, maximum: 59 })).toBe("57, 58 or 59");
    expect(expoSdkList("or", { minimum: 58, maximum: 58 })).toBe("58");
  });

  it("says nothing about a version it cannot read", () => {
    expect(unsupportedExpoSdkMessage("x54.0.0")).toBeNull();
    expect(unsupportedExpoSdkMessage("54.0")).toBeNull();
    expect(unsupportedExpoSdkMessage("54.0.0.1")).toBeNull();
  });
});

describe("installedExpoSdk, for expo", () => {
  it("is the expo Node resolves from the project", () => {
    expect(installedExpoVersion(project(expo("54.0.33")))).toBe("54.0.33");
  });

  it("is found where expo's exports leave its manifest out", () => {
    const root = project({
      "node_modules/expo/package.json": {
        name: "expo",
        version: "54.0.33",
        exports: { ".": "./index.js" },
      },
    });
    expect(installedExpoVersion(root)).toBe("54.0.33");
  });

  it("is null without expo", () => {
    expect(installedExpoVersion(project({}))).toBeNull();
  });

  it("is found at a hoisted workspace root, as Node finds it", () => {
    const root = project({
      ...expo("54.0.33"),
      "packages/lib/package.json": { name: "lib" },
    });
    expect(installedExpoVersion(path.join(root, "packages", "lib"))).toBe("54.0.33");
  });

  it("ignores another app's expo in pnpm's hidden directory, for a library without Expo", () => {
    // pnpm links every package into node_modules/.pnpm/node_modules. Node does not look
    // there from a workspace member, though it does from a package in the store: the
    // library's rn-widget resolves the app's expo, but does not peer it.
    const store = "node_modules/.pnpm/rn-widget@1.0.0/node_modules";
    const root = project({
      "node_modules/.pnpm/node_modules/expo/package.json": { name: "expo", version: "54.0.33" },
      "packages/lib/package.json": { name: "lib", dependencies: { "rn-widget": "*" } },
      [`${store}/rn-widget/package.json`]: {
        name: "rn-widget",
        peerDependencies: { "react-native": "*" },
      },
    });
    fs.mkdirSync(path.join(root, "packages", "lib", "node_modules"));
    fs.symlinkSync(
      path.join(root, store, "rn-widget"),
      path.join(root, "packages", "lib", "node_modules", "rn-widget"),
      "dir",
    );
    expect(installedExpoVersion(path.join(root, "packages", "lib"))).toBeNull();
  });

  it("is the expo a declared package resolves as its peer, under an isolated install", () => {
    // A library that declares only expo-image: pnpm links expo beside expo-image in the
    // store, and only there.
    const store = "node_modules/.pnpm/expo-image@3.0.11/node_modules";
    const root = project({
      "packages/lib/package.json": { name: "lib", dependencies: { "expo-image": "*" } },
      [`${store}/expo-image/package.json`]: {
        name: "expo-image",
        peerDependencies: { expo: "*" },
      },
      [`${store}/expo/package.json`]: { name: "expo", version: "54.0.33" },
    });
    fs.mkdirSync(path.join(root, "packages", "lib", "node_modules"));
    fs.symlinkSync(
      path.join(root, store, "expo-image"),
      path.join(root, "packages", "lib", "node_modules", "expo-image"),
      "dir",
    );
    expect(installedExpoVersion(path.join(root, "packages", "lib"))).toBe("54.0.33");
  });

  it("prefers a parent's resolvable expo to a package's own pnpm directory", () => {
    const root = project({
      ...expo("58.0.16"),
      "packages/lib/package.json": { name: "lib" },
      "packages/lib/node_modules/.pnpm/node_modules/expo/package.json": {
        name: "expo",
        version: "54.0.33",
      },
    });
    expect(installedExpoVersion(path.join(root, "packages", "lib"))).toBe("58.0.16");
  });
});

/** The copies of expo and expo-modules-core the native engine's detection reaches from `lib`. */
function reachedFrom(lib: string): ReachedCopy[] {
  const found: ReachedCopy[] = [];
  detectEcosystemPackages([lib], [], [], [], [], undefined, {
    reachedCopies: { of: EXPO_SDK_PACKAGES, found },
  });
  return found;
}
const sdkOf = (kind: ExpoWorkspace) => installedExpoSdk(null, reachedFrom(expoWorkspace(kind)));
const warningOf = (kind: ExpoWorkspace) => {
  const install = sdkOf(kind);
  return install && unsupportedMessage(install);
};

describe("expo-modules-core's major is its Expo SDK", () => {
  // From SDK 55 on (FIRST_SDK_NUMBERED_MODULES_CORE). Checked against every expo installed
  // here, whichever SDKs those are, rather than typed in.
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
    .filter(({ sdk }) => sdk >= FIRST_SDK_NUMBERED_MODULES_CORE);

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
        const installed = (JSON.parse(fs.readFileSync(core, "utf8")) as { version: string })
          .version;
        expect(Number(installed.split(".")[0]), `expo ${version}`).toBe(sdk);
      }
    },
  );
});

describe("installedExpoSdk, from what the native engine reached", () => {
  const copy = (name: ReachedCopy["name"], version: string, via: string | null = null) => ({
    name,
    version,
    via,
    dir: `/store/${name}@${version}`,
  });

  it("is the expo that resolves from the project, whatever was reached", () => {
    expect(installedExpoSdk("58.0.16", [copy("expo", "54.0.33")])).toEqual({
      package: "expo",
      version: "58.0.16",
      via: null,
    });
  });

  it("reads reached expo copies before expo-modules-core ones", () => {
    expect(
      installedExpoSdk(null, [copy("expo-modules-core", "3.0.29"), copy("expo", "58.0.20", "x")]),
    ).toEqual({ package: "expo", version: "58.0.20", via: "x" });
    expect(installedExpoSdk(null, [copy("expo-modules-core", "3.0.29", "x")])).toEqual({
      package: "expo-modules-core",
      version: "3.0.29",
      via: "x",
    });
    expect(installedExpoSdk(null, [])).toBeNull();
    expect(installedExpoSdk(null)).toBeNull();
  });

  it("names an unsupported copy wherever it comes, and never a supported one", () => {
    const old = copy("expo", "54.0.33", "kit");
    const current = copy("expo", "58.0.20", "expo-image");
    expect(installedExpoSdk(null, [current, old])).toMatchObject({ version: "54.0.33" });
    expect(installedExpoSdk(null, [old, current])).toMatchObject({ version: "54.0.33" });
    const supported = installedExpoSdk(null, [current, copy("expo", "57.0.24")]);
    expect(supported && unsupportedMessage(supported)).toBeNull();
  });

  it("is the expo reached as an Expo module's peer, through a workspace library", () => {
    expect(sdkOf("ui-kit")).toEqual({ package: "expo", version: "54.0.33", via: "expo-image" });
  });

  it("is the expo-modules-core an Expo module the project declares depends on", () => {
    expect(sdkOf("expo-thing")).toEqual({
      package: "expo-modules-core",
      version: "3.0.29",
      via: "expo-thing",
    });
  });

  it("is nothing for a library that reaches no Expo package, whatever a sibling declares", () => {
    expect(reachedFrom(expoWorkspace("nothing"))).toEqual([]);
  });

  it("names the old expo a package pins, beside the supported one the project's modules load", () => {
    expect(
      reachedFrom(expoWorkspace("stale-kit")).map(({ version, via }) => [version, via]),
    ).toEqual(
      expect.arrayContaining([
        ["54.0.33", "kit"],
        ["58.0.20", "expo-image"],
      ]),
    );
    expect(warningOf("stale-kit")).toMatch(
      /^Expo SDK 54 \(expo 54\.0\.33, reached through kit\) is not supported/,
    );
  });

  it("warns about the old expo the project's modules load, beside a supported pinned one", () => {
    expect(warningOf("old-ui")).toMatch(
      /^Expo SDK 54 \(expo 54\.0\.33, reached through expo-image\) is not supported/,
    );
  });

  it("warns about an old expo-modules-core nested below a supported one", () => {
    expect(warningOf("nested-old-core")).toMatch(
      /^expo-modules-core 3\.0\.29, reached through old-thing, is from an Expo SDK older than 55/,
    );
    expect(warningOf("supported-core")).toBeNull();
  });

  it("says an expo-modules-core below SDK 55 is from an older SDK", () => {
    expect(unsupportedMessage({ package: "expo-modules-core", version: "3.0.29", via: null })).toBe(
      "expo-modules-core 3.0.29 is from an Expo SDK older than 55, which is not supported: " +
        "vitest-native supports Expo SDK 57 and 58. Upgrade to Expo SDK 57 or 58; on an older " +
        "SDK, tests that load Expo modules can fail.",
    );
  });

  it("reads SDK 55 onward from expo-modules-core's major", () => {
    const install = (version: string): ExpoInstall => ({
      package: "expo-modules-core",
      version,
      via: null,
    });
    expect(unsupportedMessage(install("54.0.0"))).toMatch(/older than 55/);
    expect(unsupportedMessage(install("55.0.27"))).toMatch(
      /^Expo SDK 55 \(expo-modules-core 55\.0\.27\) is not supported/,
    );
    expect(unsupportedMessage(install("56.0.15"))).toMatch(
      /^Expo SDK 56 \(expo-modules-core 56\.0\.15\) is not supported/,
    );
    expect(unsupportedMessage(install("57.0.3"))).toBeNull();
    expect(unsupportedMessage(install("58.0.27"))).toBeNull();
    expect(unsupportedMessage(install("59.0.1"))).toMatch(
      /^Expo SDK 59 \(expo-modules-core 59\.0\.1\) is newer than this release supports/,
    );
  });
});

describe("doctor", () => {
  const expoSection = (root: string) => {
    const { lines } = runDoctor(root, "24.13.0");
    const start = lines.indexOf("Expo");
    return start === -1 ? "" : lines.slice(start, start + 3).join("\n");
  };

  it("warns about an unsupported Expo SDK, and only warns", () => {
    const root = project({ ...expo("54.0.33"), ...reactNativeAt("0.81.5") });
    expect(expoSection(root)).toMatch(/⚠ Expo SDK 54 \(expo 54\.0\.33\) is not supported/);
    expect(runDoctor(root, "24.13.0").lines.join("\n")).not.toContain("✓ expo");
  });

  it("describes a supported one", () => {
    const section = expoSection(project({ ...expo("58.0.16"), ...reactNativeAt("0.88.0") }));
    expect(section).not.toContain("not supported");
    expect(section).toContain("✓ expo 58.0.16 detected");
  });

  it("warns, under the native engine, about the SDK the packages it reaches name", () => {
    expect(expoSection(expoWorkspace("expo-thing"))).toContain(
      "⚠ expo-modules-core 3.0.29, reached through expo-thing, is from an Expo SDK older than 55",
    );
    expect(expoSection(expoWorkspace("ui-kit"))).toContain(
      "⚠ Expo SDK 54 (expo 54.0.33, reached through expo-image) is not supported",
    );
    expect(expoSection(expoWorkspace("stale-kit"))).toContain(
      "⚠ Expo SDK 54 (expo 54.0.33, reached through kit) is not supported",
    );
    expect(expoSection(expoWorkspace("nothing"))).toBe("");
  });

  it("finds expo as the plugin does", () => {
    const root = project({
      "node_modules/.pnpm/node_modules/expo/package.json": { name: "expo", version: "54.0.33" },
    });
    expect(expoSection(root)).toBe("");
  });
});

describe("starting the plugin", () => {
  function startable(files: Record<string, object>) {
    const root = project(files);
    for (const [name, target] of [
      ["react", REAL_REACT],
      ["vite", REAL_VITE],
    ]) {
      fs.symlinkSync(target, path.join(root, "node_modules", name), "dir");
    }
    return root;
  }

  async function start(root: string, engine: "mock" | "native" = "mock") {
    const plugin = reactNative({ engine }) as any;
    const vite = (await import("vite")) as { version: string };
    await plugin.config.handler.call(
      { meta: { viteVersion: vite.version } },
      { root },
      { command: "serve", mode: "test" },
    );
    await plugin.configResolved({ root, plugins: [], test: {} });
  }

  const quietWarnings = () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    return vi.spyOn(console, "warn").mockImplementation(() => {});
  };
  // Each test its own version: the warning is printed once per process per message.
  const expoWarnings = (warn: { mock: { calls: unknown[][] } }) =>
    warn.mock.calls.map((call) => String(call[0])).filter((line) => line.includes("Expo SDK"));

  it("warns about an unsupported Expo SDK, and still starts", async () => {
    const warn = quietWarnings();
    await start(startable({ ...expo("54.0.1"), ...reactNativeAt("0.81.5") }));
    expect(expoWarnings(warn)).toHaveLength(1);
  });

  it("warns once for several projects of one run", async () => {
    const warn = quietWarnings();
    await start(startable({ ...expo("54.0.2"), ...reactNativeAt("0.81.5") }));
    await start(startable({ ...expo("54.0.2"), ...reactNativeAt("0.81.5") }));
    expect(expoWarnings(warn)).toHaveLength(1);
  });

  it("warns, under the native engine, about the SDK the packages it reaches name", async () => {
    vi.stubEnv("VITEST_NATIVE_NO_REGISTRY", "1");
    const warn = quietWarnings();
    await start(expoWorkspace("expo-thing"), "native");
    expect(expoWarnings(warn)).toEqual([
      "[vitest-native] expo-modules-core 3.0.29, reached through expo-thing, is from an Expo " +
        "SDK older than 55, which is " +
        "not supported: vitest-native supports Expo SDK 57 and 58. Upgrade to Expo SDK 57 or " +
        "58; on an older SDK, tests that load Expo modules can fail.",
    ]);
  });

  it("checks only the project root under the mock engine", async () => {
    const warn = quietWarnings();
    await start(expoWorkspace("expo-thing"), "mock");
    expect(expoWarnings(warn)).toEqual([]);
  });

  it("is silent about a supported one", async () => {
    const warn = quietWarnings();
    await start(startable({ ...expo("58.0.16"), ...reactNativeAt("0.88.0") }));
    expect(expoWarnings(warn)).toEqual([]);
  });
});
