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
 * Options are received via process.env (set by the plugin's config() hook
 * via test.env). This is necessary because the plugin runs in Vite's main
 * process while this setup file runs in Vitest worker processes — globalThis
 * does NOT survive that boundary.
 */

import { vi, afterAll, expect as vitestExpect } from "vitest";
import { buildReactNativeMock } from "./mocks/registry.js";
import { installCjsBridge, uninstallCjsBridge, installPresetCjsBridge } from "./cjs-bridge.js";
import * as presetFactories from "./presets/index.js";
import { createRequire } from "node:module";
import path from "node:path";
import type { Preset } from "./types.js";
import { AUTO_DETECT_PRESETS } from "./preset-map.js";
import { serializer as rnSerializer } from "./serializer.js";

// --- Read options from process.env ---

const platform = (process.env.VITEST_NATIVE_PLATFORM as "ios" | "android") || "ios";
const diagnostics = process.env.VITEST_NATIVE_DIAGNOSTICS === "true";

let customMocks: Record<string, any> = {};
if (process.env.VITEST_NATIVE_MOCKS) {
  try {
    customMocks = JSON.parse(process.env.VITEST_NATIVE_MOCKS);
  } catch (e) {
    if (diagnostics) {
      console.warn(`[vitest-native] Failed to parse VITEST_NATIVE_MOCKS: ${(e as Error)?.message}`);
    }
  }
}

// Explicit preset names from plugin config, or null for auto-detect.
let explicitPresetNames: string[] | null = null;
if (process.env.VITEST_NATIVE_PRESET_NAMES) {
  try {
    explicitPresetNames = JSON.parse(process.env.VITEST_NATIVE_PRESET_NAMES);
  } catch (e) {
    if (diagnostics) {
      console.warn(
        `[vitest-native] Failed to parse VITEST_NATIVE_PRESET_NAMES: ${(e as Error)?.message}`,
      );
    }
    explicitPresetNames = null;
  }
}

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

g.IS_REACT_ACT_ENVIRONMENT = true;
g.IS_REACT_NATIVE_TEST_ENVIRONMENT = true;

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
  const projectRoot = process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd();
  const projectReq = createRequire(path.join(projectRoot, "package.json"));
  const detected: Preset[] = [];
  for (const [pkgName, exportName] of Object.entries(AUTO_DETECT_PRESETS)) {
    try {
      projectReq.resolve(pkgName);
      // Package is installed — load and call our preset factory
      const factory = loadPresetFactory(exportName);
      if (factory) {
        detected.push(factory());
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
  : autoDetectPresets();

// Initialize a global store for preset mocks so that virtual modules
// (served by the plugin's load() hook) can read them at runtime.
g.__vitest_native_preset_mocks = g.__vitest_native_preset_mocks || {};

// Preset mocks are handled by:
// 1. The plugin's resolveId() redirecting ESM imports to virtual modules
//    that read from globalThis.__vitest_native_preset_mocks
// 2. The CJS bridge intercepting require() calls
for (const preset of presets) {
  for (const [modName, presetModule] of Object.entries(preset.modules)) {
    const presetMock = presetModule.factory();
    installPresetCjsBridge(modName, presetMock);
    // Store on globalThis so virtual ESM modules can access named exports.
    g.__vitest_native_preset_mocks[modName] = presetMock;
    if (diagnostics) {
      console.log(`[vitest-native] Registered preset mock: ${modName} (${preset.name})`);
    }
  }
}

// --- 5. Configure @testing-library/react-native ---

try {
  const rntl = require("@testing-library/react-native");
  if (rntl?.configure) {
    rntl.configure({
      hostComponentNames: {
        text: "Text",
        textInput: "TextInput",
        switch: "Switch",
        scrollView: "ScrollView",
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
  const matchers = require("@testing-library/react-native/build/matchers");
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

// --- 7. Register snapshot serializer for readable RN component output ---

vitestExpect.addSnapshotSerializer(rnSerializer);

// --- 8. Cleanup ---

afterAll(() => {
  uninstallCjsBridge();
});
