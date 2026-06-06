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

installGlobals();
register("./loader.mjs", import.meta.url, { data: { projectRoot, transformPkgs } });
installRequireHooks(projectRoot, transformPkgs);

// --- Third-party preset mocks ---
//
// Native-runtime libraries (Reanimated's worklets, gesture-handler natives, …)
// cannot execute in Node, so the native engine shadows them with the same
// self-contained mocks the mock engine uses. The plugin resolves which presets
// are active (sync, from installed packages) and passes their names here; the
// plugin's resolveId/load redirect each preset import to a virtual module that
// reads the mock from globalThis.__vitest_native_preset_mocks (populated below).
const g = globalThis;
g.__vitest_native_preset_mocks = g.__vitest_native_preset_mocks || {};

let presetNames = [];
try {
  if (process.env.VITEST_NATIVE_PRESET_NAMES)
    presetNames = JSON.parse(process.env.VITEST_NATIVE_PRESET_NAMES);
} catch {}

for (const name of presetNames) {
  const factory = presetFactories[name];
  if (typeof factory !== "function") continue;
  const preset = factory();
  for (const [modName, presetModule] of Object.entries(preset.modules)) {
    g.__vitest_native_preset_mocks[modName] = presetModule.factory();
    if (diagnostics) {
      console.log(`[vitest-native] (native) registered preset mock: ${modName} (${preset.name})`);
    }
  }
}

// NOTE: the cosmetic React "update to LogBoxStateSubscription not wrapped in
// act()" warning (which used to appear on every interaction) is fixed at the
// source — the native boundary stubs LogBoxNotificationContainer (the dev UI
// AppContainer mounts) to render null, so LogBoxStateSubscription never mounts
// and never schedules its out-of-act setState. See boundary.mjs + the regression
// test tests-native/logbox-act.test.tsx.
