/**
 * Auto-injected setup file for vitest-native.
 *
 * This file is added to `test.setupFiles` by the Vite plugin. It:
 * 1. Sets React Native globals (__DEV__, requestAnimationFrame, etc.)
 * 2. Installs the CJS bridge so require('react-native') resolves to mocks
 * 3. Registers vi.mock('react-native') with the full mock object
 * 4. Auto-detects and installs preset mocks
 * 5. Configures @testing-library/react-native host component names
 * 6. Auto-registers RNTL matchers
 * 7. Registers snapshot serializer
 *
 * Options are received through the project context, which the plugin's config() hook
 * writes and names in test.env. This is necessary because the plugin runs in Vite's main
 * process while this setup file runs in Vitest worker processes — globalThis
 * does NOT survive that boundary.
 */

import { vi, afterAll, expect as vitestExpect } from "vitest";
import { buildReactNativeMock } from "./mocks/registry.js";
import { installCjsBridge, uninstallCjsBridge, installPresetCjsBridge } from "./cjs-bridge.js";
import * as presetFactories from "./presets/index.js";
import Module, { createRequire } from "node:module";
import path from "node:path";
import type { Preset } from "./types.js";
import { importPresetModule, presetModulePaths } from "./preset-modules.mjs";
import { installRendererReportError } from "./report-error.mjs";
import { AUTO_DETECT_PRESETS, presetForInstalled } from "./preset-map.js";
import { serializer as rnSerializer } from "./serializer.js";
import { animatedMatchers } from "./matchers/animated.js";
import { projectContext, type ProjectContextFields } from "./context.mjs";

// --- Read options from the project context ---

// Without the plugin (the setup file imported on its own), the defaults it always had.
const context: Partial<ProjectContextFields> = projectContext() ?? {};
const platform = context.platform ?? "ios";
const diagnostics = context.diagnostics === true;
const projectRoot = context.projectRoot ?? process.cwd();
const projectReq = createRequire(path.join(projectRoot, "package.json"));

// Copied: the context is frozen, and these become the test's own mutable mocks.
const customMocks: Record<string, any> =
  context.mocks && typeof context.mocks === "object" ? structuredClone(context.mocks) : {};

// Explicit preset names from plugin config, or null for auto-detect.
const explicitPresetNames: string[] | null = context.presetNames ? [...context.presetNames] : null;
// Names switched off by `presets: { name: false }`. Auto-detection still runs in the
// worker; these are removed from what it finds.
const disabledPresetNames: string[] = [...(context.presetDisabled ?? [])];

// --- 1. Globals ---

const g = globalThis as any;

Object.defineProperties(g, {
  __DEV__: {
    configurable: true,
    enumerable: true,
    value: true,
    writable: true,
  },
  requestAnimationFrame: {
    configurable: true,
    enumerable: true,
    value: (callback: (time: number) => void) => setTimeout(() => callback(Date.now()), 0),
    writable: true,
  },
  cancelAnimationFrame: {
    configurable: true,
    enumerable: true,
    value: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    writable: true,
  },
  // Only set window if it doesn't already exist (e.g. jsdom provides its own)
  ...(typeof g.window === "undefined"
    ? {
        window: {
          configurable: true,
          enumerable: true,
          value: g,
          writable: true,
        },
      }
    : {}),
  nativeFabricUIManager: {
    configurable: true,
    enumerable: true,
    value: {},
    writable: true,
  },
});

// RNTL 13+ auto-registers its matchers against globalThis.expect when its
// package entry is imported. Provide the same Vitest expect instance without
// forcing the rest of `test.globals` on consumers.
if (typeof g.expect === "undefined") {
  Object.defineProperty(g, "expect", {
    configurable: true,
    enumerable: false,
    value: vitestExpect,
    writable: true,
  });
}

g.IS_REACT_ACT_ENVIRONMENT = true;
g.IS_REACT_NATIVE_TEST_ENVIRONMENT = true;
// Before react-test-renderer loads: it picks its error reporter once (report-error.mjs).
installRendererReportError(Module, g);

// --- 2. Build mock and install CJS bridge ---

const rnMock = buildReactNativeMock(platform);

// Merge any user-provided mock overrides
if (Object.keys(customMocks).length > 0) {
  Object.assign(rnMock, customMocks);
}

// Expose mock to helpers (vitest-native/helpers reads this) and to
// virtual modules (react-native/* subpath ESM imports read this).
g.__vitest_native_mock = rnMock;

installCjsBridge(rnMock);

// --- 3. Register vi.mock('react-native') ---

vi.mock("react-native", () => rnMock);

// --- 4. Auto-detect and install preset mocks ---

// AUTO_DETECT_PRESETS imported from shared preset-map.ts (single source of truth)

/** Load a preset factory by its export name. */
function loadPresetFactory(exportName: string): (() => Preset) | null {
  // Presets are statically imported — works in both source (Vite transforms TS)
  // and built (tsdown bundles the chunk) contexts. No createRequire needed.
  const factory = (presetFactories as Record<string, unknown>)[exportName];
  return typeof factory === "function" ? (factory as () => Preset) : null;
}

function autoDetectPresets(): Preset[] {
  const detected: Preset[] = [];
  const enabled = new Set<string>();
  for (const [pkgName, exportName] of Object.entries(AUTO_DETECT_PRESETS)) {
    try {
      if (presetForInstalled(pkgName, projectReq) === null) continue;
      if (enabled.has(exportName)) continue;
      // Package is installed — load and call our preset factory
      const factory = loadPresetFactory(exportName);
      if (factory) {
        detected.push(factory());
        enabled.add(exportName);
        if (diagnostics) {
          console.log(`[vitest-native] Auto-detected ${pkgName} → enabled ${exportName} preset`);
        }
      }
    } catch {
      // Package not installed — skip
    }
  }
  return detected;
}

function loadExplicitPresets(names: string[]): Preset[] {
  const loaded: Preset[] = [];
  for (const name of names) {
    const factory = loadPresetFactory(name);
    if (factory) {
      loaded.push(factory());
    }
  }
  return loaded;
}

// Determine which presets to use.
const presets = explicitPresetNames
  ? loadExplicitPresets(explicitPresetNames)
  : autoDetectPresets().filter((p) => !disabledPresetNames.includes(p.name));

// Initialize a global store for preset mocks so that virtual modules
// (served by the plugin's load() hook) can read them at runtime.
g.__vitest_native_preset_mocks = g.__vitest_native_preset_mocks || Object.create(null);

// Preset mocks are handled by:
// 1. The plugin's resolveId() redirecting ESM imports to virtual modules
//    that read from globalThis.__vitest_native_preset_mocks
// 2. The CJS bridge intercepting require() calls
// Which preset modules to shadow: the plugin read every module's named exports while
// resolving its config, and a module whose package is not installed (null) is not
// shadowed. Without the plugin's list, every module is.
const presetExports = (context.presetExports ?? {}) as Record<string, string[] | null>;
const preparations: Promise<void>[] = [];
/** Registers a preset's modules, now or once its preparation settles. */
function activate(preset: Preset): Promise<void> | void {
  const modules = Object.entries(preset.modules).filter(
    ([modName]) => presetExports[modName] !== null,
  );
  const register = () => {
    for (const [modName, presetModule] of modules) {
      const presetMock = presetModule.factory();
      installPresetCjsBridge(modName, presetMock);
      // Store on globalThis so virtual ESM modules can access named exports.
      g.__vitest_native_preset_mocks[modName] = presetMock;
      if (diagnostics) {
        console.log(`[vitest-native] Registered preset mock: ${modName} (${preset.name})`);
      }
    }
  };
  // A preset with async preparation (the skia preset loads CanvasKit) registers its
  // modules once that settles; preset-ready.mjs, the next setup file, awaits it.
  const preparation = modules.length > 0 ? preset.prepare?.() : undefined;
  if (preparation) return preparation.then(register);
  register();
}
for (const preset of presets) {
  const pending = activate(preset);
  if (pending) preparations.push(pending);
}
// Preset modules of the project's own (presets: ['./path']), imported through Vitest
// so a TypeScript module loads; preset-ready.mjs awaits them like a preparation.
for (const file of presetModulePaths()) {
  preparations.push(
    importPresetModule(vi, file).then((preset) => activate(preset as unknown as Preset)),
  );
}
const presetsReady = Promise.all(preparations);
// preset-ready.mjs surfaces a failure. Without it (this file listed by hand), a
// failure surfaces where the module is used, not as an unhandled rejection.
presetsReady.catch(() => {});
g.__vitest_native_presets_ready = presetsReady;

// --- 5. Configure @testing-library/react-native ---

try {
  const rntl = projectReq("@testing-library/react-native");
  // RNTL >=14 removed the `hostComponentNames` configure option: it now
  // auto-detects host components by rendering a probe (which works with the
  // mock's host names). Passing the option there is a no-op that logs an
  // "Unknown option(s) passed to configure" warning, so only set it for
  // RNTL <=13. If the version can't be read, fall back to configuring it
  // (the historical behavior, required by older RNTL).
  let rntlMajor = 0;
  try {
    const { version } = projectReq("@testing-library/react-native/package.json") as {
      version?: string;
    };
    rntlMajor = Number(String(version).split(".")[0]) || 0;
  } catch {}
  if (rntl?.configure && rntlMajor < 14) {
    rntl.configure({
      hostComponentNames: {
        text: "Text",
        textInput: "TextInput",
        switch: "RCTSwitch",
        scrollView: "RCTScrollView",
        modal: "Modal",
        image: "Image",
        button: "Button",
        pressable: "Pressable",
        view: "View",
        activityIndicator: "ActivityIndicator",
      },
    });
  }
} catch (e) {
  if (diagnostics) {
    console.log(
      `[vitest-native] @testing-library/react-native not available: ${(e as Error)?.message}`,
    );
  }
}

// --- 6. Auto-register RNTL built-in matchers (toBeVisible, toHaveStyle, etc.) ---

try {
  let matchers: Record<string, unknown> | null = null;
  let lastError: unknown;
  for (const moduleId of [
    "@testing-library/react-native/matchers",
    "@testing-library/react-native/build/matchers",
    "@testing-library/react-native/dist/matchers",
  ]) {
    try {
      matchers = projectReq(moduleId);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!matchers) throw lastError;
  if (matchers && Object.keys(matchers).length > 0) {
    // Filter to only actual matcher functions (skip __esModule, etc.)
    const matcherFns: Record<string, Function> = {};
    for (const [key, val] of Object.entries(matchers)) {
      if (typeof val === "function" && key !== "__esModule") {
        matcherFns[key] = val as Function;
      }
    }
    if (Object.keys(matcherFns).length > 0) {
      vitestExpect.extend(matcherFns as Record<string, (...args: any[]) => any>);
      if (diagnostics) {
        console.log(
          `[vitest-native] Registered ${Object.keys(matcherFns).length} RNTL matchers: ${Object.keys(matcherFns).join(", ")}`,
        );
      }
    }
  }
} catch (e: any) {
  if (diagnostics) {
    console.log(`[vitest-native] Could not load RNTL matchers: ${e?.message}`);
  }
}

// --- 7. Register reanimated-compatible matchers (toHaveAnimatedStyle, etc.) ---

vitestExpect.extend(animatedMatchers as Record<string, (...args: any[]) => any>);
if (diagnostics) {
  console.log(
    `[vitest-native] Registered ${Object.keys(animatedMatchers).length} animated matchers: ${Object.keys(animatedMatchers).join(", ")}`,
  );
}

// --- 8. Register snapshot serializer for readable RN component output ---

vitestExpect.addSnapshotSerializer(rnSerializer);

// --- 9. Cleanup ---

afterAll(() => {
  uninstallCjsBridge();
});
