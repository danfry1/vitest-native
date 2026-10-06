// Nitro (react-native-nitro-modules) is a native boundary of its own. Its JS asks the
// NitroModules TurboModule to install(), which on a device puts the JSI-backed
// `global.NitroModulesProxy` in place, then reads that global and throws without it.
// The boundary's install() (native/boundary.mjs) calls this to do the same with a proxy
// that has no hybrid objects: importing Nitro succeeds, and libraries with their own
// test mode run their real JS (react-native-mmkv 3+ checks VITEST_WORKER_ID and never
// creates one). Creating a hybrid object says plainly that no native implementation
// exists, rather than handing back a stub that silently does nothing.
//
// The interface is react-native-nitro-modules' own `NitroModulesProxy`
// (src/NitroModulesProxy.ts).
import { createRequire } from "node:module";
import path from "node:path";
import { VitestNativeError } from "../errors.mjs";

/** The installed react-native-nitro-modules version, which Nitro compares on load. */
function nitroVersion(projectRoot) {
  try {
    return createRequire(path.join(projectRoot, "package.json"))(
      "react-native-nitro-modules/package.json",
    ).version;
  } catch {
    return "0.0.0";
  }
}

export function installNitroProxy(projectRoot) {
  if (globalThis.NitroModulesProxy != null) return;
  globalThis.NitroModulesProxy = {
    version: nitroVersion(projectRoot),
    buildType: "debug",
    createHybridObject(name) {
      throw new VitestNativeError(
        "NITRO_HYBRID_OBJECT_UNAVAILABLE",
        `Nitro HybridObject '${name}' has no native implementation in tests. Use the ` +
          `library's own test mode if it has one, or mock the library with vi.mock().`,
      );
    },
    hasHybridObject: () => false,
    isHybridObject: () => false,
    getAllHybridObjectNames: () => [],
    box: (obj) => ({ unbox: () => obj }),
    hasNativeState: () => false,
    updateMemorySize: (obj) => obj,
    createNativeArrayBuffer: (size) => new ArrayBuffer(size),
    debug_getTotalAllocatedHybridObjects: () => 0,
  };
}
