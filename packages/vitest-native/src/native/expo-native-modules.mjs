// How an Expo native module answers under the native engine: one resolver, consulted by
// `globalThis.expo.modules` (globals.mjs) the first time a module is required.
//
// The package's JavaScript is the package; only the native module it reaches with
// requireNativeModule is substituted, in this order:
//
//   0. The Expo runtime option (`expo: { runtime }`, native-modules.mjs) decides whether
//      the modules it names exist, and the constants it names come before any layer
//      below.
//   1. Absent, when an installed package only probes for it and nothing installed
//      defines it (expoAbsentModules): requireOptionalNativeModule returns null, as on a
//      device. Unless a package mock stands in for it. Presence is the check the React
//      Native boundary shares (native-modules.mjs, modulePresent).
//   2. The package's own mock of its native module (mocks/<Name>.ts, which Expo
//      generates), as jest-expo serves it. It is the whole module: a member it leaves
//      out is undefined.
//   3. Expo's table of the native modules for the installed SDK, as that SDK's jest-expo
//      ships it (expo-module-table-<sdk>.mjs), with jest-expo's values for the members it
//      lists. On the installed SDK's own table, a lowercase member it leaves out is a
//      constant the module lacks; an SDK without a table borrows the nearest one's.
//   4. The generic stub's conventions (globals.mjs) for anything else.
//
// The scanning behind each layer lives in expo-module-mocks.mjs.
import {
  expoAbsentModules,
  expoModuleMock,
  expoModuleMockIndex,
  expoModuleTableDescribesInstalledSdk,
  expoModuleTableMembers,
} from "./expo-module-mocks.mjs";
import { modulePresent } from "./native-modules.mjs";

/**
 * @typedef {{ members: Record<string, unknown>, complete: boolean, listsConstants?: boolean }} ExpoNativeModuleSeed
 *   `complete` when the members are the whole module (a package mock); otherwise the
 *   stub's conventions answer what they leave out, except, with `listsConstants` (the
 *   installed SDK's own table), a lowercase member, which is undefined.
 */

/**
 * @param {{ projectRoot: string, cacheDir: () => string | null, mockFn: (impl: Function) => Function }} options
 *   `cacheDir` gives the directory the scans are cached in; `mockFn` wraps a mock's
 *   functions (vi.fn in a test run).
 */
export function createExpoNativeModuleResolver({ projectRoot, cacheDir, mockFn }) {
  // Read on the first lookup, cache directory included, so a test file that touches no
  // Expo module pays nothing.
  let absent;
  const baseSeed = (name) => {
    const own = expoModuleMock(projectRoot, name, mockFn);
    if (own) return { members: own, complete: true };
    const listed = expoModuleTableMembers(projectRoot, name, mockFn);
    if (!listed) return null;
    return {
      members: listed,
      complete: false,
      listsConstants: expoModuleTableDescribesInstalledSdk(projectRoot),
    };
  };
  return {
    /** Whether the module exists (layers 0 and 1). */
    present(name) {
      absent ??= expoAbsentModules(projectRoot, cacheDir());
      return modulePresent(name, {
        seeded: expoModuleMockIndex(projectRoot).has(name),
        scanned: !absent.has(name),
      });
    },
    /**
     * What a present module starts with (layers 0, 2 and 3), or null for the stub alone.
     * @returns {ExpoNativeModuleSeed | null}
     */
    seed(name) {
      const constants = globalThis.__vitest_native_module_presence?.expo?.constants;
      const runtime = constants && Object.hasOwn(constants, name) ? constants[name] : null;
      const base = baseSeed(name);
      if (!runtime) return base;
      return base
        ? { ...base, members: { ...base.members, ...runtime } }
        : { members: { ...runtime }, complete: false };
    },
  };
}
