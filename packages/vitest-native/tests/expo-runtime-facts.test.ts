// Every fact native/native-modules.mjs (expoRuntimeFacts) encodes about Expo's runtimes, read from the
// installed Expo packages' own source. An Expo release that changes one fails here by
// name, instead of the engine going on serving a runtime Expo no longer has.
//
// VN_EXPO_FACTS_ROOT points the reads at another install (a directory whose node_modules
// holds expo, and expo-dev-launcher if it is to be checked too): an Expo release can be
// checked before the workspace takes it.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageDirOf } from "../src/native/match.mjs";
import { expoRuntimeFacts } from "../src/native/native-modules.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = process.env.VN_EXPO_FACTS_ROOT || path.resolve(HERE, "..");

function requirePackage(name: string, from: string): string {
  const dir = packageDirOf(name, from);
  if (!dir) throw new Error(`${name} is not installed from ${from}`);
  return dir;
}

const read = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), "utf8");

/** The first of `files` the package has (a file Expo moved between SDKs), read. */
function readFirst(dir: string, files: string[]): string {
  const file = files.find((f) => fs.existsSync(path.join(dir, f)));
  if (!file) throw new Error(`none of ${files.join(", ")} in ${dir}`);
  return read(dir, file);
}

const expo = requirePackage("expo", projectRoot);
// As expo's own imports find them.
const modulesCore = requirePackage("expo-modules-core", expo);
const constants = requirePackage("expo-constants", expo);

const devBuild = expoRuntimeFacts("development-build", { devLauncher: true })!;
const devBuildWithoutLauncher = expoRuntimeFacts("development-build", { devLauncher: false })!;

describe("Expo's runtimes, as its source tells them apart", () => {
  it("expo decides Expo Go by whether the ExpoGo native module exists", () => {
    // The source, and the build Metro runs where the package ships one (SDK 58; SDK 57
    // ships only the source).
    const files = ["src/environment/ExpoGo.ts", "build/environment/ExpoGo.js"].filter(
      (file) => file.startsWith("src/") || fs.existsSync(path.join(expo, file)),
    );
    for (const file of files) {
      const source = read(expo, file);
      expect(source, file).toMatch(/requireNativeModule\(\s*['"]ExpoGo['"]\s*\)/);
      expect(source, file).toMatch(
        /function isRunningInExpoGo\(\)[^{]*\{\s*return NativeExpoGoModule != null;/,
      );
    }
    // So a development build has no ExpoGo.
    expect(devBuild.modules.ExpoGo).toEqual({ present: false });
    expect(devBuildWithoutLauncher.modules.ExpoGo).toEqual({ present: false });
  });

  it("expo-modules-core looks in expo.modules, then NativeModulesProxy, then TurboModuleRegistry", () => {
    // Why the runtime is one check both registries share: removing ExpoGo from
    // expo.modules alone leaves TurboModuleRegistry answering it.
    const source = read(modulesCore, "src/requireNativeModule.ts");
    expect(source).toMatch(
      /globalThis\.expo\?\.modules\?\.\[moduleName\]\s*\?\?\s*NativeModulesProxy\[moduleName\]\s*\?\?\s*createTurboModuleToExpoProxy\(TurboModuleRegistry\.get\(moduleName\)/,
    );
    // requireNativeModule throws when that finds nothing, which isRunningInExpoGo catches.
    expect(source).toMatch(/if \(!nativeModule\) \{\s*throw new Error\(`Cannot find native module/);
  });

  it("expo-modules-core reads nothing that differs between the runtimes", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "__tests__" || entry.name === "__mocks__") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) files.push(full);
      }
    };
    walk(path.join(modulesCore, "src"));
    expect(files.length).toBeGreaterThan(20);
    const runtimeReads = files.filter((file) =>
      /ExpoGo|EXDevLauncher|executionEnvironment|appOwnership/.test(fs.readFileSync(file, "utf8")),
    );
    expect(runtimeReads).toEqual([]);
  });

  it("expo reads NativeModules.EXDevLauncher as the development client", () => {
    expect(read(expo, "src/Expo.fx.tsx")).toMatch(
      /IS_RUNNING_IN_DEV_CLIENT = !!NativeModules\.EXDevLauncher;/,
    );
    expect(devBuild.modules.EXDevLauncher.present).toBe(true);
    expect(devBuildWithoutLauncher.modules.EXDevLauncher).toEqual({ present: false });
  });

  it("expo-constants reads EXDevLauncher's manifest only when it is set", () => {
    const source = read(constants, "src/Constants.ts");
    expect(source).toMatch(
      /if \(NativeModules\.EXDevLauncher\) \{\s*let devLauncherManifest;\s*if \(NativeModules\.EXDevLauncher\.manifestString\) \{/,
    );
    // Seeded without one, so expo-constants keeps the manifest it has.
    expect(devBuild.modules.EXDevLauncher.members).toEqual([]);
  });

  it("expo-constants' native module reports a bare execution environment and no appOwnership", () => {
    const encoded = devBuild.constants.ExponentConstants;
    expect(Object.keys(encoded).sort()).toEqual(["appOwnership", "executionEnvironment"]);

    const ios = readFirst(constants, [
      "ios/EXConstantsObjC/EXConstantsService.m", // SDK 58
      "ios/EXConstantsService.m", // SDK 57
    ]);
    const iosBare = /NSString \* const EXConstantsExecutionEnvironmentBare = @"([^"]+)";/.exec(ios);
    expect(ios).toMatch(/@"executionEnvironment": EXConstantsExecutionEnvironmentBare,/);
    expect(iosBare?.[1]).toBe(encoded.executionEnvironment);
    expect(ios).not.toMatch(/appOwnership/);

    const android = read(
      constants,
      "android/src/main/java/expo/modules/constants/ConstantsService.kt",
    );
    const androidBare = /BARE\("([^"]+)"\)/.exec(android);
    expect(android).toMatch(/"executionEnvironment" to ExecutionEnvironment\.BARE\.string/);
    expect(androidBare?.[1]).toBe(encoded.executionEnvironment);
    expect(android).not.toMatch(/appOwnership/);

    // The module lacks appOwnership, which Constants.ts turns into null.
    expect(Object.hasOwn(encoded, "appOwnership")).toBe(true);
    expect(encoded.appOwnership).toBeUndefined();
    const js = read(constants, "src/Constants.ts");
    expect(js).toMatch(/appOwnership: appOwnership \?\? null,/);
    expect(read(constants, "src/ExponentConstants.ts")).toMatch(
      /requireOptionalNativeModule\(\s*['"]ExponentConstants['"]\s*\)/,
    );
  });

  // expo-dev-launcher is not a dependency of this workspace; a project that installs it
  // (as expo-dev-client's dependency) checks its registration here too.
  // TODO: once CI installs expo-dev-launcher, fail here instead of skipping when
  // process.env.CI is set and it is missing, so the check cannot go quiet.
  const devLauncher = packageDirOf("expo-dev-launcher", projectRoot);
  it.skipIf(devLauncher === null)(
    "expo-dev-launcher registers EXDevLauncher, with only manifest constants, in debug builds",
    () => {
      const ios = read(devLauncher!, "ios/EXDevLauncher.m");
      expect(ios).toMatch(/@implementation EXDevLauncher\s+RCT_EXPORT_MODULE\(\)/);
      const android = read(
        devLauncher!,
        "android/src/debug/java/expo/modules/devlauncher/modules/DevLauncherModule.kt",
      );
      expect(android).toMatch(/override fun getName\(\) = "EXDevLauncher"/);
      expect([...android.matchAll(/"(\w+)" to /g)].map((m) => m[1]).sort()).toEqual([
        "manifestString",
        "manifestURL",
      ]);
    },
  );
});
