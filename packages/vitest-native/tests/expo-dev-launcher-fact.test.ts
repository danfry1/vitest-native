// The fact native/native-modules.mjs (DEV_LAUNCHER_MODULE, EXPO_GO_ABSENT_MODULES)
// encodes: Expo reads `NativeModules.EXDevLauncher` as its development-client signal,
// so the default runtime, which models Expo Go, has no such module. Read from the
// installed expo and expo-constants, as expo's own imports find them, in both the
// TypeScript source and the build that runs. An Expo release that reads the dev
// launcher differently fails here by name.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEV_LAUNCHER_MODULE, EXPO_GO_ABSENT_MODULES } from "../src/native/native-modules.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** `name`'s real directory as Node finds it from `from`. Read from disk. */
function packageDir(name: string, from: string): string {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return fs.realpathSync(candidate);
    if (path.dirname(dir) === dir) throw new Error(`${name} is not installed from ${from}`);
  }
}

const read = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), "utf8");

const expo = packageDir("expo", path.resolve(HERE, ".."));
const constants = packageDir("expo-constants", expo);

describe("EXDevLauncher, as Expo's source reads it", () => {
  it("is the one module the default runtime (Expo Go) lacks", () => {
    expect(DEV_LAUNCHER_MODULE).toBe("EXDevLauncher");
    expect(EXPO_GO_ABSENT_MODULES).toEqual([DEV_LAUNCHER_MODULE]);
  });

  it("expo reads its presence as running in a development client", () => {
    for (const file of ["src/Expo.fx.tsx", "build/Expo.fx.js"]) {
      expect(read(expo, file), file).toMatch(
        new RegExp(`IS_RUNNING_IN_DEV_CLIENT = !!NativeModules\\.${DEV_LAUNCHER_MODULE};`),
      );
    }
  });

  it("expo-constants parses its manifestString whenever it is present", () => {
    for (const file of ["src/Constants.ts", "build/Constants.js"]) {
      expect(read(constants, file), file).toMatch(
        new RegExp(
          `if \\(NativeModules\\.${DEV_LAUNCHER_MODULE}\\) \\{\\s*let devLauncherManifest;\\s*` +
            `if \\(NativeModules\\.${DEV_LAUNCHER_MODULE}\\.manifestString\\) \\{\\s*` +
            `devLauncherManifest = JSON\\.parse\\(NativeModules\\.${DEV_LAUNCHER_MODULE}\\.manifestString\\);`,
        ),
      );
    }
  });
});
