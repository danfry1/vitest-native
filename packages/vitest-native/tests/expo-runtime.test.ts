// `reactNative({ expo: { runtime } })`: the option's validation, the context it
// writes, and the one presence check the React Native boundary and expo.modules share
// (native/native-modules.mjs, modulePresent). tests-native/expo-runtime/ runs it against
// the installed Expo packages; tests/expo-runtime-facts.test.ts holds each encoded fact
// to Expo's source.
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reactNative } from "../src/plugin.js";
import { boundarySourceFor } from "../src/native/boundary.mjs";
import { installGlobals } from "../src/native/globals.mjs";
import {
  devLauncherInstalled,
  EXPO_RUNTIMES,
  expoRuntimeFacts,
  installKnownNativeModules,
  modulePresent,
  runtimeModule,
} from "../src/native/native-modules.mjs";
// @ts-expect-error — runtime .mjs
import { createExpoNativeModuleResolver } from "../src/native/expo-native-modules.mjs";
import { runPluginConfig } from "./plugin-config.js";
import { contextOf, stubProjectContext } from "./project-context-helpers.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(HERE, "..");
const SERVE_ENV = { command: "serve", mode: "test" } as const;
const g = globalThis as Record<string, any>;
// The default runtime's facts: Expo Go, which has no EXDevLauncher.
const expoGo = expoRuntimeFacts(undefined, { devLauncher: false });

function evalCjs(source: string): any {
  const filename = path.join(projectRoot, "expo-runtime-boundary-test.js");
  const m = new Module(filename);
  m.filename = filename;
  // @ts-expect-error internal
  m.paths = Module._nodeModulePaths(projectRoot);
  // @ts-expect-error internal
  m._compile(source, filename);
  return m.exports;
}

const load = () => ({
  tm: evalCjs(boundarySourceFor("/x/react-native/Libraries/TurboModule/TurboModuleRegistry.js")!),
  nm: evalCjs(boundarySourceFor("/x/react-native/Libraries/BatchedBridge/NativeModules.js")!)
    .default,
});

/** A temporary directory, removed after the test. */
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-expo-runtime-"));
  onTestFinished(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function installPackage(root: string, name: string): string {
  const dir = path.join(root, "node_modules", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
  return dir;
}

describe("expo.runtime: validation", () => {
  it("accepts each runtime, and an empty object", () => {
    for (const runtime of EXPO_RUNTIMES) {
      expect(() => reactNative({ expo: { runtime } })).not.toThrow();
    }
    expect(() => reactNative({ expo: {} })).not.toThrow();
  });

  it("names an unknown runtime, and the values it accepts", () => {
    expect(() => reactNative({ expo: { runtime: "dev-client" } } as any)).toThrow(
      `"expo.runtime" must be "expo-go" or "development-build".`,
    );
    expect(() => reactNative({ expo: { runtime: true } } as any)).toThrow(/"expo\.runtime"/);
  });

  it("rejects a non-object and an unknown key", () => {
    for (const expo of [null, "development-build", ["development-build"], true]) {
      expect(() => reactNative({ expo } as any)).toThrow(`"expo" must be an options object.`);
    }
    expect(() => reactNative({ expo: { runtime: "expo-go", sdk: 58 } } as any)).toThrow(
      `Unknown expo option "sdk". Valid options: runtime.`,
    );
  });

  it("fails by name under the mock engine", async () => {
    for (const runtime of EXPO_RUNTIMES) {
      const plugin = reactNative({ engine: "mock", expo: { runtime } }) as any;
      await expect(runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV)).rejects.toThrow(
        expect.objectContaining({
          code: "EXPO_RUNTIME_REQUIRES_NATIVE_ENGINE",
          message: expect.stringContaining(`only supported by engine:'native'`),
        }),
      );
    }
    // No runtime, no error.
    const plain = reactNative({ engine: "mock", expo: {} }) as any;
    await expect(runPluginConfig(plain, { root: projectRoot }, SERVE_ENV)).resolves.toBeTruthy();
  });
});

describe("expo.runtime beside the expo preset", () => {
  const conflict = expect.objectContaining({
    code: "EXPO_RUNTIME_CONFLICTS_WITH_EXPO_PRESET",
    message: expect.stringContaining("stand-in that models Expo Go"),
  });

  it("rejects a development build with the expo preset turned on, either way", async () => {
    const { expo } = await import("../src/presets/expo.js");
    for (const presets of [{ expo: true }, [expo()]]) {
      const plugin = reactNative({
        engine: "native",
        expo: { runtime: "development-build" },
        presets,
      } as any) as any;
      await expect(runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV)).rejects.toThrow(
        conflict,
      );
    }
  });

  it("accepts the preset with Expo Go, and a development build without it", async () => {
    for (const options of [
      { presets: { expo: true } },
      { presets: { expo: true }, expo: { runtime: "expo-go" as const } },
      { expo: { runtime: "development-build" as const } },
      { presets: { expo: false }, expo: { runtime: "development-build" as const } },
    ]) {
      const plugin = reactNative({ engine: "native", ...options } as any) as any;
      await expect(runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV)).resolves.toBeTruthy();
    }
  });
});

describe("expo.runtime: the project context", () => {
  it("writes the development build and whether expo-dev-launcher is installed", async () => {
    const config = await runPluginConfig(
      reactNative({ engine: "native", expo: { runtime: "development-build" } }) as any,
      { root: projectRoot },
      SERVE_ENV,
    );
    expect(contextOf(config).expoRuntime).toBe("development-build");
    expect(contextOf(config).expoDevLauncher).toBe(devLauncherInstalled(projectRoot));
  });

  it("writes nothing for the default, spelled out or not", async () => {
    const contexts = [];
    for (const options of [{}, { expo: { runtime: "expo-go" as const } }, { expo: {} }]) {
      const config = await runPluginConfig(
        reactNative({ engine: "native", ...options }) as any,
        { root: projectRoot },
        SERVE_ENV,
      );
      expect(contextOf(config).expoRuntime).toBeUndefined();
      expect(contextOf(config).expoDevLauncher).toBeUndefined();
      contexts.push((config as any).test.env.VITEST_NATIVE_CONTEXT);
    }
    // The same context: 'expo-go' is the default, not a variant of it.
    expect(new Set(contexts).size).toBe(1);
  });

  it("is read into the facts the boundary consults", () => {
    try {
      stubProjectContext({ expoRuntime: "development-build", expoDevLauncher: true });
      installKnownNativeModules(projectRoot);
      expect(g.__vitest_native_module_presence.expo).toEqual(
        expoRuntimeFacts("development-build", { devLauncher: true }),
      );
      stubProjectContext({});
      installKnownNativeModules(projectRoot);
      expect(g.__vitest_native_module_presence.expo).toEqual(expoGo);
    } finally {
      vi.unstubAllEnvs();
      installKnownNativeModules(projectRoot);
    }
  });
});

describe("expo-dev-launcher detection", () => {
  it("finds it at the root, under expo-dev-client in a strict layout, or not at all", () => {
    const direct = tempDir();
    installPackage(direct, "expo-dev-launcher");
    expect(devLauncherInstalled(direct)).toBe(true);

    // pnpm: the project sees expo-dev-client; expo-dev-launcher sits beside its real path.
    const strict = tempDir();
    const store = path.join(strict, "node_modules", ".pnpm", "expo-dev-client@1", "node_modules");
    installPackage(path.dirname(store), "expo-dev-launcher");
    const devClient = installPackage(path.dirname(store), "expo-dev-client");
    fs.mkdirSync(path.join(strict, "app", "node_modules"), { recursive: true });
    fs.symlinkSync(devClient, path.join(strict, "app", "node_modules", "expo-dev-client"), "dir");
    expect(devLauncherInstalled(path.join(strict, "app"))).toBe(true);

    const none = tempDir();
    installPackage(none, "expo-dev-client");
    expect(devLauncherInstalled(none)).toBe(false);
  });
});

describe("the shared presence check", () => {
  let saved: Record<string, unknown>;
  const keys = [
    "__vitest_native_known_modules",
    "__vitest_native_module_mocks",
    "__vitest_native_module_specs",
  ];
  let savedPresence: { permissive: unknown; expo: unknown };
  const runtime = (devLauncher: boolean) => {
    g.__vitest_native_module_presence.expo = expoRuntimeFacts("development-build", { devLauncher });
  };
  beforeEach(() => {
    saved = Object.fromEntries(keys.map((k) => [k, g[k]]));
    const { permissive, expo } = g.__vitest_native_module_presence;
    savedPresence = { permissive, expo };
    g.__vitest_native_known_modules = new Set(["Appearance"]);
    g.__vitest_native_module_mocks = Object.create(null);
    g.__vitest_native_module_specs = new Map();
    g.__vitest_native_module_presence.permissive = false;
    g.__vitest_native_module_presence.expo = expoGo;
  });
  afterEach(() => {
    for (const k of keys) g[k] = saved[k];
    Object.assign(g.__vitest_native_module_presence, savedPresence);
  });

  it("answers in order: mock, runtime, seeded, scanned, permissive", () => {
    runtime(false);
    // 1 over 2.
    g.__vitest_native_module_mocks.ExpoGo = {};
    expect(modulePresent("ExpoGo", { mocked: true })).toBe(true);
    // 2 over 3 and 4.
    expect(modulePresent("ExpoGo", { seeded: true, scanned: true })).toBe(false);
    // 3 over 4.
    expect(modulePresent("Other", { seeded: true, scanned: false })).toBe(true);
    // 4 over 5.
    g.__vitest_native_module_presence.permissive = true;
    expect(modulePresent("Other", { scanned: false })).toBe(false);
    // 5.
    expect(modulePresent("Other")).toBe(true);
    g.__vitest_native_module_presence.permissive = false;
    expect(modulePresent("Other")).toBe(false);
  });

  it("never lets the runtime make a React Native core module absent", () => {
    g.__vitest_native_module_presence.expo = {
      modules: { Appearance: { present: false }, PlatformConstants: { present: false } },
      constants: {},
    };
    expect(runtimeModule("Appearance")).toBeUndefined();
    expect(runtimeModule("PlatformConstants", true)).toBeUndefined();
    expect(runtimeModule("PlatformConstants")).toEqual({ present: false });
    const { tm, nm } = load();
    expect(tm.getEnforcing("Appearance")).toBe(nm.Appearance);
    expect(tm.getEnforcing("PlatformConstants").getConstants().isTesting).toBe(true);
    expect(tm.get("PlatformConstants")).not.toBeNull();
    expect(nm.PlatformConstants).toBeDefined();
    expect(tm.get("Appearance")).toBe(nm.Appearance);
  });

  it("does not read inherited names as runtime modules", () => {
    runtime(true);
    expect(runtimeModule("toString")).toBeUndefined();
    expect(runtimeModule("constructor")).toBeUndefined();
  });

  describe.each(["device", "permissive"] as const)("the boundary, nativeModules: %s", (mode) => {
    beforeEach(() => {
      g.__vitest_native_module_presence.permissive = mode === "permissive";
    });

    it("has no ExpoGo in a development build, and getEnforcing throws for it", () => {
      runtime(false);
      const { tm, nm } = load();
      expect(tm.get("ExpoGo")).toBeNull();
      expect(nm.ExpoGo).toBeUndefined();
      expect("ExpoGo" in nm).toBe(false);
      let error: Error | undefined;
      try {
        tm.getEnforcing("ExpoGo");
      } catch (e) {
        error = e as Error;
      }
      // React Native's own invariant (Libraries/TurboModule/TurboModuleRegistry.js).
      expect(error?.name).toBe("Invariant Violation");
      expect(error?.message).toBe(
        "TurboModuleRegistry.getEnforcing(...): 'ExpoGo' could not be found. " +
          "Verify that a module by this name is registered in the native binary.",
      );
    });

    it("has EXDevLauncher exactly when expo-dev-launcher is installed, with no members", () => {
      runtime(true);
      let { tm, nm } = load();
      const launcher = nm.EXDevLauncher;
      expect(launcher).toBeDefined();
      expect(tm.get("EXDevLauncher")).toBe(launcher);
      expect(tm.getEnforcing("EXDevLauncher")).toBe(launcher);
      // Without a manifest, as expo-constants then keeps its own.
      expect(launcher.manifestString).toBeUndefined();
      expect("manifestString" in launcher).toBe(false);
      expect(launcher.getConstants).toBeUndefined();

      runtime(false);
      ({ tm, nm } = load());
      expect(nm.EXDevLauncher).toBeUndefined();
      expect(tm.get("EXDevLauncher")).toBeNull();
      expect(() => tm.getEnforcing("EXDevLauncher")).toThrow(/'EXDevLauncher' could not be found/);
    });

    it("lets a test's mockNativeModule() come before the runtime", () => {
      runtime(false);
      const { tm, nm } = load();
      const ExpoGo = { expoVersion: "58.0.0" };
      g.__vitest_native_module_mocks.ExpoGo = ExpoGo;
      expect(tm.get("ExpoGo")).toBe(ExpoGo);
      expect(tm.getEnforcing("ExpoGo")).toBe(ExpoGo);
      expect(nm.ExpoGo).toBe(ExpoGo);
      delete g.__vitest_native_module_mocks.ExpoGo;
      expect(tm.get("ExpoGo")).toBeNull();
    });

    it("leaves every other name as without the option", () => {
      runtime(true);
      const { tm, nm } = load();
      expect(nm.Appearance).toBeDefined();
      expect(tm.get("SomethingElse") === null).toBe(mode === "device");
      // getEnforcing still stands a stub in for a name the runtime does not name.
      expect(typeof tm.getEnforcing("SomethingElse")).toBe("object");
    });
  });

  it("the default answers ExpoGo and EXDevLauncher as before the option", () => {
    const { tm, nm } = load();
    // ExpoGo is no React Native module, so the boundary has it only when permissive;
    // Expo Go's presence comes from expo.modules (below).
    expect(tm.get("ExpoGo")).toBeNull();
    expect(nm.EXDevLauncher).toBeUndefined();
    expect(typeof tm.getEnforcing("ExpoGo")).toBe("object");
  });
});

describe("the Expo resolver under a runtime", () => {
  afterEach(() => {
    g.__vitest_native_module_presence.expo = expoGo;
  });

  const resolverIn = (root: string) =>
    createExpoNativeModuleResolver({
      projectRoot: root,
      cacheDir: () => null,
      mockFn: (fn: () => unknown) => vi.fn(fn),
    });

  it("makes ExpoGo absent and seeds expo-constants' development-build values", () => {
    const root = tempDir();
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    const resolver = resolverIn(root);
    // The default: ExpoGo exists, and ExponentConstants comes from jest-expo's table.
    expect(resolver.present("ExpoGo")).toBe(true);
    expect(resolver.seed("ExponentConstants").members.executionEnvironment).toBe("mock");

    g.__vitest_native_module_presence.expo = expoRuntimeFacts("development-build", {
      devLauncher: false,
    });
    expect(resolver.present("ExpoGo")).toBe(false);
    expect(resolver.present("ExponentConstants")).toBe(true);
    const seed = resolver.seed("ExponentConstants");
    expect(seed.complete).toBe(false);
    expect(seed.members.executionEnvironment).toBe("bare");
    expect(Object.hasOwn(seed.members, "appOwnership")).toBe(true);
    expect(seed.members.appOwnership).toBeUndefined();
    // The table's other members stay.
    expect(seed.members.statusBarHeight).toBe(54);
  });

  it("puts the runtime before a package's own mock", () => {
    const root = tempDir();
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    const dir = installPackage(root, "expo-go-mocking");
    fs.writeFileSync(path.join(dir, "expo-module.config.json"), "{}");
    fs.mkdirSync(path.join(dir, "mocks"));
    fs.writeFileSync(path.join(dir, "mocks", "ExpoGo.js"), "exports.expoVersion = '1';");
    const resolver = resolverIn(root);
    expect(resolver.present("ExpoGo")).toBe(true);
    g.__vitest_native_module_presence.expo = expoRuntimeFacts("development-build", {
      devLauncher: false,
    });
    expect(resolver.present("ExpoGo")).toBe(false);
  });
});

describe("expo.modules before the Expo resolver exists", () => {
  it("asks the shared presence check, so the runtime applies from the start", () => {
    installGlobals();
    const presence = g.__vitest_native_module_presence;
    const savedResolver = g.__vitest_native_expo_modules;
    const savedExpo = presence.expo;
    delete g.__vitest_native_expo_modules;
    try {
      presence.expo = expoRuntimeFacts("development-build", { devLauncher: false });
      expect(g.expo.modules.ExpoGo).toBeUndefined();
      expect("ExpoGo" in g.expo.modules).toBe(false);
      // Every name the runtime does not name is present, as without a resolver before.
      expect(g.expo.modules.VNAnyModule).toBeDefined();
      presence.expo = expoGo;
      expect("ExpoGo" in g.expo.modules).toBe(true);
      expect("EXDevLauncher" in g.expo.modules).toBe(false);
    } finally {
      presence.expo = savedExpo;
      g.__vitest_native_expo_modules = savedResolver;
    }
  });
});
