import { afterEach, describe, expect, it } from "vitest";
import { TurboModuleRegistry } from "react-native";

// react-native-nitro-modules asks the NitroModules TurboModule to install() and then
// reads `global.NitroModulesProxy`, which a device's JSI install puts there. The
// boundary's install() does the same with a proxy that has no hybrid objects, so
// Nitro imports and libraries with their own test mode (react-native-mmkv 4) run.
const g = globalThis as { NitroModulesProxy?: Record<string, any> };

describe("Nitro boundary", () => {
  afterEach(() => {
    delete g.NitroModulesProxy;
  });

  it("installs global.NitroModulesProxy as the native install() does", () => {
    delete g.NitroModulesProxy;
    const turbo = TurboModuleRegistry.getEnforcing<{ install(): string | undefined }>(
      "NitroModules",
    );
    expect(turbo.install()).toBeUndefined();
    expect(g.NitroModulesProxy?.hasHybridObject("MMKVFactory")).toBe(false);
    expect(g.NitroModulesProxy?.getAllHybridObjectNames()).toEqual([]);
    expect(typeof g.NitroModulesProxy?.version).toBe("string");
  });

  it("says plainly that a hybrid object has no native implementation", () => {
    TurboModuleRegistry.getEnforcing<{ install(): void }>("NitroModules").install();
    let error: unknown;
    try {
      g.NitroModulesProxy?.createHybridObject("MMKVFactory");
    } catch (e) {
      error = e;
    }
    expect(error).toMatchObject({
      name: "VitestNativeError",
      code: "NITRO_HYBRID_OBJECT_UNAVAILABLE",
      message: expect.stringMatching(
        /^\[vitest-native\] Nitro HybridObject 'MMKVFactory' has no native implementation/,
      ),
    });
  });
});
