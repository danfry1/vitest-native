// Native-engine setup file (injected into test.setupFiles by the plugin). Installs
// globals, registers the ESM loader hook, and installs the CJS require hooks.
import { register } from "node:module";
import { installGlobals } from "./globals.mjs";
import { installRequireHooks } from "./hooks.mjs";

const projectRoot = process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd();

installGlobals();
register("./loader.mjs", import.meta.url, { data: { projectRoot } });
installRequireHooks(projectRoot);

// NOTE: a cosmetic React "update to LogBoxStateSubscription not wrapped in act()"
// warning can appear when real RN emits a dev warning during an interaction. We
// stub InitializeCore (so LogBox's console patch is never installed), which means
// LogBox.uninstall()/ignoreAllLogs() in setup do NOT suppress it — the update
// comes from LogBoxData's setImmediate notifying observers outside act(). Tracked
// for a proper fix; importing RN here just to disable LogBox added ~1.3s of setup
// time for no effect, so it was removed.
