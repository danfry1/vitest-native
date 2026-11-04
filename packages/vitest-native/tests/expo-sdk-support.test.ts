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
import { detectEcosystemPackages } from "../src/native/ecosystem.js";
import { dependencyDirOf } from "../src/native/match.mjs";
import {
  expoSdkList,
  installedExpoSdk,
  installedExpoVersion as rootExpoVersion,
  SUPPORTED_EXPO_SDKS,
  unsupportedExpoSdkMessage as unsupportedMessage,
  type ExpoInstall,
} from "../src/peer-requirements.js";

const unsupportedExpoSdkMessage = (version: string) =>
  unsupportedMessage({ package: "expo", version });
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
  vi.unstubAllEnvs();
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

// The native engine's toolchain and the plugin's required peers, from this repository's
// install, so a fixture workspace resolves the engine as native.
const TOOLCHAIN = ["react-native", "@react-native/babel-preset", "@babel/core", "react", "vite"];

/** Links `target` as `<from>/node_modules/<name>`; both relative to `root`. */
function link(root: string, from: string, name: string, target: string) {
  const at = path.join(root, from, "node_modules", name);
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.symlinkSync(path.isAbsolute(target) ? target : path.join(root, target), at, "dir");
}

const STORE = "node_modules/.pnpm";
const inStore = (id: string, name: string) => `${STORE}/${id}/node_modules/${name}`;

/**
 * A pnpm workspace whose packages/lib is the project. `lib` is what lib declares:
 * - "ui-kit": a workspace UI library declaring expo-image, whose peer expo 54 is linked
 *   beside it in the store; packages/app declares that expo, so the engine detects it.
 * - "expo-thing": an installed Expo module that depends on expo-modules-core 3.0.29.
 * - "nothing": no Expo package; packages/app still declares expo 54.
 * In none of them does `expo` resolve from packages/lib.
 */
function workspace(lib: "ui-kit" | "expo-thing" | "nothing"): string {
  const root = project({
    "package.json": { name: "ws", private: true, workspaces: ["packages/*"] },
    "packages/app/package.json": { name: "app", dependencies: { expo: "*" } },
    "packages/ui-kit/package.json": {
      name: "ui-kit",
      dependencies: { "expo-image": "*" },
      peerDependencies: { "react-native": "*" },
    },
    "packages/lib/package.json": {
      name: "lib",
      dependencies: lib === "nothing" ? {} : { [lib]: "*" },
    },
    [`${inStore("expo@54.0.33", "expo")}/package.json`]: {
      name: "expo",
      version: "54.0.33",
      peerDependencies: { "react-native": "*" },
    },
    [`${inStore("expo-image@3.0.11", "expo-image")}/package.json`]: {
      name: "expo-image",
      version: "3.0.11",
      peerDependencies: { expo: "*", "react-native": "*" },
    },
    [`${inStore("expo-thing@1.0.0", "expo-thing")}/package.json`]: {
      name: "expo-thing",
      version: "1.0.0",
      dependencies: { "expo-modules-core": "*" },
      peerDependencies: { "react-native": "*" },
    },
    [`${inStore("expo-modules-core@3.0.29", "expo-modules-core")}/package.json`]: {
      name: "expo-modules-core",
      version: "3.0.29",
    },
  });
  for (const name of TOOLCHAIN) {
    link(root, ".", name, fs.realpathSync(path.join(PACKAGE_ROOT, "node_modules", name)));
  }
  link(root, "packages/app", "expo", inStore("expo@54.0.33", "expo"));
  link(root, "packages/ui-kit", "expo-image", inStore("expo-image@3.0.11", "expo-image"));
  link(root, `${STORE}/expo-image@3.0.11`, "expo", inStore("expo@54.0.33", "expo"));
  link(
    root,
    `${STORE}/expo-thing@1.0.0`,
    "expo-modules-core",
    inStore("expo-modules-core@3.0.29", "expo-modules-core"),
  );
  if (lib === "ui-kit") link(root, "packages/lib", "ui-kit", "packages/ui-kit");
  if (lib === "expo-thing") {
    link(root, "packages/lib", "expo-thing", inStore("expo-thing@1.0.0", "expo-thing"));
  }
  return path.join(root, "packages", "lib");
}

/** The native engine's detection of `lib`, as the plugin runs it, with what it reached. */
function detect(lib: string, reachedVersions?: Map<string, string>) {
  const calls: string[] = [];
  const dirOf = (name: string, from: string) => {
    calls.push(`${name}\0${from}`);
    return dependencyDirOf(name, from);
  };
  detectEcosystemPackages([lib], [], [], [], [], dirOf, { reachedVersions });
  return calls;
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
    expect(unsupportedMessage({ package: "expo-modules-core", version })).toBeNull();
  });
});

describe("installedExpoSdk, from what the native engine reached", () => {
  const reached = (entries: Record<string, string>) => new Map(Object.entries(entries));

  it("prefers the expo that resolves from the project", () => {
    const root = project(expo("58.0.16"));
    expect(installedExpoSdk(root, reached({ expo: "54.0.33" }))).toEqual({
      package: "expo",
      version: "58.0.16",
    });
  });

  it("reads a reached expo, then a reached expo-modules-core", () => {
    const root = project({});
    expect(
      installedExpoSdk(root, reached({ expo: "54.0.33", "expo-modules-core": "3.0.29" })),
    ).toEqual({ package: "expo", version: "54.0.33" });
    expect(installedExpoSdk(root, reached({ "expo-modules-core": "3.0.29" }))).toEqual({
      package: "expo-modules-core",
      version: "3.0.29",
    });
    expect(installedExpoSdk(root, reached({ "expo-image": "3.0.11" }))).toBeNull();
    expect(installedExpoSdk(root)).toBeNull();
  });

  it("is the expo reached as an Expo module's peer, through a workspace library", () => {
    const versions = new Map<string, string>();
    detect(workspace("ui-kit"), versions);
    expect(versions.get("expo")).toBe("54.0.33");
  });

  it("is the expo-modules-core an Expo module the project declares depends on", () => {
    const versions = new Map<string, string>();
    detect(workspace("expo-thing"), versions);
    expect(versions.get("expo-modules-core")).toBe("3.0.29");
    expect(versions.has("expo")).toBe(false);
  });

  it("is nothing for a library that reaches no Expo package, whatever a sibling declares", () => {
    const versions = new Map<string, string>();
    detect(workspace("nothing"), versions);
    expect([...versions.keys()]).toEqual([]);
  });

  it("says an expo-modules-core below the supported SDKs is from an older one", () => {
    expect(unsupportedMessage({ package: "expo-modules-core", version: "3.0.29" })).toBe(
      "expo-modules-core 3.0.29 is from an Expo SDK older than 57, which is not supported: " +
        "vitest-native supports Expo SDK 57 and 58. Upgrade to Expo SDK 57 or 58; on an older " +
        "SDK, tests that load Expo modules can fail.",
    );
  });

  it("reads a supported or newer SDK from expo-modules-core's major", () => {
    const install = (version: string): ExpoInstall => ({ package: "expo-modules-core", version });
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

describe("the SDK check's cost", () => {
  // The fallback reads what detection already found, so it may add no module resolution,
  // in detection or after it. Counted on projects without expo, where it runs.
  it("adds no package lookup to detection", () => {
    for (const lib of [workspace("expo-thing"), workspace("ui-kit"), workspace("nothing")]) {
      expect(detect(lib, new Map())).toEqual(detect(lib));
    }
  });

  it("adds no module resolution or file read to the root check", () => {
    const Module = createRequire(import.meta.url)("node:module") as {
      _resolveFilename: (...args: unknown[]) => unknown;
    };
    const lib = workspace("expo-thing");
    const reached = new Map<string, string>();
    detect(lib, reached);
    const count = (run: () => unknown) => {
      const resolve = vi.spyOn(Module, "_resolveFilename");
      const read = vi.spyOn(fs, "readFileSync");
      run();
      const counts = [resolve.mock.calls.length, read.mock.calls.length];
      resolve.mockRestore();
      read.mockRestore();
      return counts;
    };
    const rootOnly = count(() => rootExpoVersion(lib));
    expect(rootOnly[0]).toBeGreaterThan(0);
    expect(count(() => installedExpoSdk(lib, reached))).toEqual(rootOnly);
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
    expect(expoSection(workspace("expo-thing"))).toContain(
      "⚠ expo-modules-core 3.0.29 is from an Expo SDK older than 57",
    );
    expect(expoSection(workspace("ui-kit"))).toContain(
      "⚠ Expo SDK 54 (expo 54.0.33) is not supported",
    );
    expect(expoSection(workspace("nothing"))).toBe("");
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
    await start(workspace("expo-thing"), "native");
    expect(expoWarnings(warn)).toEqual([
      "[vitest-native] expo-modules-core 3.0.29 is from an Expo SDK older than 57, which is " +
        "not supported: vitest-native supports Expo SDK 57 and 58. Upgrade to Expo SDK 57 or " +
        "58; on an older SDK, tests that load Expo modules can fail.",
    ]);
  });

  it("checks only the project root under the mock engine", async () => {
    const warn = quietWarnings();
    await start(workspace("expo-thing"), "mock");
    expect(expoWarnings(warn)).toEqual([]);
  });

  it("is silent about a supported one", async () => {
    const warn = quietWarnings();
    await start(startable({ ...expo("58.0.16"), ...reactNativeAt("0.88.0") }));
    expect(expoWarnings(warn)).toEqual([]);
  });
});
