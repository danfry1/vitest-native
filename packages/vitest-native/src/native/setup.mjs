// Native-engine setup file (injected into test.setupFiles by the plugin). Installs
// globals, registers the ESM loader hook, installs the CJS require hooks, and
// builds any third-party preset mocks the project uses.
import { register } from "node:module";
import { installGlobals } from "./globals.mjs";
import { installRequireHooks } from "./hooks.mjs";
import * as presetFactories from "../presets.mjs";

const projectRoot = process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd();
const diagnostics = process.env.VITEST_NATIVE_DIAGNOSTICS === "true";
// Extra node_modules packages to transform (from the plugin's `transform` option).
let transformPkgs = [];
try {
  if (process.env.VITEST_NATIVE_TRANSFORM)
    transformPkgs = JSON.parse(process.env.VITEST_NATIVE_TRANSFORM);
} catch {}

// --- Third-party preset mocks ---
//
// Native-runtime libraries (Reanimated's worklets, gesture-handler natives, …)
// cannot execute in Node, so the native engine shadows them with the same
// self-contained mocks the mock engine uses. The plugin resolves which presets
// are active (sync, from installed packages) and passes their names here.
//
// Redirection happens in three places that must agree:
//   1. the Vite plugin's resolveId/load (the app/test graph's direct imports),
//   2. the ESM loader hook (bare imports reaching Node, incl. nested inside
//      externalized third-party libs),
//   3. the CJS require hook (nested require() from externalized libs).
// All three read the mock object from globalThis.__vitest_native_preset_mocks
// (populated below). (2) and (3) close the gap where a third-party library pulls
// in a preset package itself — those requests never reach Vite.
let presetNames = [];
try {
  if (process.env.VITEST_NATIVE_PRESET_NAMES)
    presetNames = JSON.parse(process.env.VITEST_NATIVE_PRESET_NAMES);
} catch {}

// Discover preset module (package) names + their static export lists WITHOUT
// building the mocks yet — building can lazily touch react-native, so the require
// hooks must be installed first.
const presetDefs = []; // [{ pkg, mod, presetName }]
const presetExports = {}; // pkg -> string[] (named exports, for the ESM loader)
const presetPkgNames = []; // [pkg] (for the CJS require hook)
for (const name of presetNames) {
  const factory = presetFactories[name];
  if (typeof factory !== "function") continue;
  const preset = factory();
  for (const [pkg, mod] of Object.entries(preset.modules)) {
    presetDefs.push({ pkg, mod, presetName: preset.name });
    presetExports[pkg] = mod.exports || [];
    presetPkgNames.push(pkg);
  }
}

installGlobals();
register("./loader.mjs", import.meta.url, {
  data: { projectRoot, transformPkgs, presetExports },
});
installRequireHooks(projectRoot, transformPkgs, presetPkgNames);

// Build the mock objects now that the require hooks are installed (preset
// factories may lazily resolve react-native at render time).
const g = globalThis;
g.__vitest_native_preset_mocks = g.__vitest_native_preset_mocks || {};
for (const { pkg, mod, presetName } of presetDefs) {
  g.__vitest_native_preset_mocks[pkg] = mod.factory();
  if (diagnostics) {
    console.log(`[vitest-native] (native) registered preset mock: ${pkg} (${presetName})`);
  }
}

// NOTE: the cosmetic React "update to LogBoxStateSubscription not wrapped in
// act()" warning (which used to appear on every interaction) is fixed at the
// source — the native boundary stubs LogBoxNotificationContainer (the dev UI
// AppContainer mounts) to render null, so LogBoxStateSubscription never mounts
// and never schedules its out-of-act setState. See boundary.mjs + the regression
// test tests-native/logbox-act.test.tsx.
