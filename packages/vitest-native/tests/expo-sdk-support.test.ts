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
import {
  expoSdkList,
  installedExpoSdk,
  SUPPORTED_EXPO_SDKS,
  unsupportedExpoSdkMessage as unsupportedMessage,
  type ExpoInstall,
} from "../src/peer-requirements.js";

const unsupportedExpoSdkMessage = (version: string) =>
  unsupportedMessage({ package: "expo", version, via: null });
const installedExpoVersion = (root: string) => {
  const install = installedExpoSdk(root);
  return install?.package === "expo" ? install.version : null;
};

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fromPackage = createRequire(path.join(PACKAGE_ROOT, "package.json"));
const REAL_REACT = path.dirname(fromPackage.resolve("react/package.json"));
const REAL_VITE = path.dirname(fromPackage.resolve("vite/package.json"));
const temps: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
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

/** Links `target` (relative to `root`) as `<root>/<from>/node_modules/<name>`. */
function link(root: string, from: string, name: string, target: string) {
  const at = path.join(root, from, "node_modules", name);
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.symlinkSync(path.join(root, target), at, "dir");
}

/**
 * A pnpm workspace library that declares only ui-kit, another workspace member, whose
 * Expo module depends on expo-modules-core: no `expo` resolves from the library or from
 * anything it reaches.
 */
function libraryReachingModulesCore(version: string, uiKit: object = {}): string {
  const store = "node_modules/.pnpm";
  const root = project({
    "packages/lib/package.json": { name: "lib", dependencies: { "ui-kit": "*" } },
    "packages/ui-kit/package.json": {
      name: "ui-kit",
      dependencies: { "expo-thing": "*" },
      peerDependencies: { "react-native": "*" },
      ...uiKit,
    },
    [`${store}/expo-thing@1.0.0/node_modules/expo-thing/package.json`]: {
      name: "expo-thing",
      dependencies: { "expo-modules-core": "*" },
      peerDependencies: { "react-native": "*" },
    },
    [`${store}/expo-modules-core@${version}/node_modules/expo-modules-core/package.json`]: {
      name: "expo-modules-core",
      version,
    },
  });
  link(root, "packages/lib", "ui-kit", "packages/ui-kit");
  link(root, "packages/ui-kit", "expo-thing", `${store}/expo-thing@1.0.0/node_modules/expo-thing`);
  link(
    root,
    `${store}/expo-thing@1.0.0`,
    "expo-modules-core",
    `${store}/expo-modules-core@${version}/node_modules/expo-modules-core`,
  );
  return path.join(root, "packages", "lib");
}

describe("expo-modules-core's major is its Expo SDK", () => {
  // The rule installedExpoSdk reads an SDK by where `expo` does not resolve, checked
  // against the expo this package installs (a supported SDK) rather than typed in.
  const expoDir = path.dirname(fromPackage.resolve("expo/package.json"));
  const expoVersion = (
    JSON.parse(fs.readFileSync(path.join(expoDir, "package.json"), "utf8")) as {
      version: string;
    }
  ).version;
  const sdk = Number(expoVersion.split(".")[0]);

  it("in the installed expo's bundledNativeModules.json", () => {
    const bundled = JSON.parse(
      fs.readFileSync(path.join(expoDir, "bundledNativeModules.json"), "utf8"),
    ) as Record<string, string>;
    expect(sdk).toBeGreaterThanOrEqual(SUPPORTED_EXPO_SDKS.minimum);
    expect(sdk).toBeLessThanOrEqual(SUPPORTED_EXPO_SDKS.maximum);
    expect(bundled["expo-modules-core"]).toMatch(new RegExp(`^~${sdk}\\.`));
  });

  it("in the expo-modules-core that expo installs", () => {
    const manifest = createRequire(path.join(expoDir, "package.json")).resolve(
      "expo-modules-core/package.json",
    );
    const { version } = JSON.parse(fs.readFileSync(manifest, "utf8")) as { version: string };
    expect(Number(version.split(".")[0])).toBe(sdk);
    const install: ExpoInstall = { package: "expo-modules-core", version, via: null };
    expect(unsupportedMessage(install)).toBeNull();
  });
});

describe("installedExpoSdk, where expo does not resolve", () => {
  it("is the expo-modules-core Node resolves from the project", () => {
    const root = project({
      "node_modules/expo-modules-core/package.json": {
        name: "expo-modules-core",
        version: "3.0.29",
      },
    });
    expect(installedExpoSdk(root)).toEqual({
      package: "expo-modules-core",
      version: "3.0.29",
      via: null,
    });
  });

  it("is the expo-modules-core a package the project reaches depends on, under an isolated install", () => {
    expect(installedExpoSdk(libraryReachingModulesCore("3.0.29"))).toEqual({
      package: "expo-modules-core",
      version: "3.0.29",
      via: "expo-thing",
    });
  });

  it("is the expo a package the project reaches resolves, before any expo-modules-core", () => {
    const root = libraryReachingModulesCore("3.0.29");
    const thing = path.join(
      root,
      "../../node_modules/.pnpm/expo-thing@1.0.0/node_modules/expo-thing/package.json",
    );
    fs.writeFileSync(
      thing,
      JSON.stringify({
        name: "expo-thing",
        dependencies: { "expo-modules-core": "*" },
        peerDependencies: { expo: "*" },
      }),
    );
    const expoDir = path.join(root, "../../node_modules/.pnpm/expo-thing@1.0.0/node_modules/expo");
    fs.mkdirSync(expoDir, { recursive: true });
    fs.writeFileSync(
      path.join(expoDir, "package.json"),
      JSON.stringify({ name: "expo", version: "54.0.33" }),
    );
    expect(installedExpoSdk(root)).toEqual({
      package: "expo",
      version: "54.0.33",
      via: "expo-thing",
    });
  });

  it("is not looked for through a package that is not React Native's or Expo's", () => {
    // ui-kit declares no React Native: what it depends on cannot load an Expo module
    // on React Native's behalf.
    const lib = libraryReachingModulesCore("3.0.29", { peerDependencies: {} });
    expect(installedExpoSdk(lib)).toBeNull();
  });

  it("says an expo-modules-core below the supported SDKs is from an older one", () => {
    const message = unsupportedMessage({
      package: "expo-modules-core",
      version: "3.0.29",
      via: "expo-thing",
    });
    expect(message).toBe(
      "expo-modules-core 3.0.29 via expo-thing is from an Expo SDK older than 57, which is not " +
        "supported: vitest-native supports Expo SDK 57 and 58. Upgrade to Expo SDK 57 or 58; " +
        "on an older SDK, tests that load Expo modules can fail.",
    );
  });

  it("reads a supported or newer SDK from expo-modules-core's major", () => {
    const install = (version: string): ExpoInstall => ({
      package: "expo-modules-core",
      version,
      via: null,
    });
    expect(unsupportedMessage(install("56.0.4"))).toMatch(
      /^expo-modules-core 56\.0\.4 is from an Expo SDK older than 57/,
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

  it("warns about the SDK expo-modules-core names where expo does not resolve", () => {
    const lib = libraryReachingModulesCore("3.0.29");
    expect(expoSection(lib)).toContain(
      "⚠ expo-modules-core 3.0.29 via expo-thing is from an Expo SDK older than 57",
    );
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

  async function start(root: string) {
    const plugin = reactNative({ engine: "mock" }) as any;
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

  it("warns about the SDK expo-modules-core names where expo does not resolve", async () => {
    const warn = quietWarnings();
    await start(
      startable({
        "node_modules/expo-modules-core/package.json": {
          name: "expo-modules-core",
          version: "3.0.28",
        },
        ...reactNativeAt("0.81.5"),
      }),
    );
    expect(expoWarnings(warn)).toEqual([
      "[vitest-native] expo-modules-core 3.0.28 is from an Expo SDK older than 57, which is " +
        "not supported: vitest-native supports Expo SDK 57 and 58. Upgrade to Expo SDK 57 or " +
        "58; on an older SDK, tests that load Expo modules can fail.",
    ]);
  });

  it("is silent about a supported one", async () => {
    const warn = quietWarnings();
    await start(startable({ ...expo("58.0.16"), ...reactNativeAt("0.88.0") }));
    expect(expoWarnings(warn)).toEqual([]);
  });
});
