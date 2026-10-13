// Presets given as module paths: `presets: ['./test/presets/my-lib.ts']`.
//
// A preset's module factories are functions, and a function in the user's Vitest
// config cannot reach a test worker: the plugin passes workers JSON (environment
// variables), and each worker rebuilds the built-in presets by name. A preset of the
// project's own is therefore named by the module that exports it. The plugin imports
// that module while it resolves its config (for the preset's name, modules and
// export names) and hands the path to the workers, which import it again and call
// its factories there.
//
// Plain .mjs, shipped verbatim like errors.mjs: the plugin, the mock engine's setup
// and the native engine's setup file all load this same file.
import { VitestNativeTypeError } from "./errors.mjs";

/**
 * The preset a preset module exports: its default export, either a preset or a
 * function returning one (called with no arguments).
 */
export function presetFromModule(namespace, file) {
  const exported = namespace?.default;
  const preset = typeof exported === "function" ? exported() : exported;
  const isObject = (value) => value !== null && typeof value === "object";
  if (
    !isObject(preset) ||
    typeof preset.name !== "string" ||
    !preset.name ||
    !isObject(preset.modules)
  ) {
    throw new VitestNativeTypeError(
      "INVALID_OPTION",
      `The preset module ${file} must default-export a preset ({ name, modules }) or a ` +
        `function that returns one.`,
    );
  }
  for (const [moduleName, presetModule] of Object.entries(preset.modules)) {
    if (
      !isObject(presetModule) ||
      typeof presetModule.factory !== "function" ||
      !(Array.isArray(presetModule.exports) || typeof presetModule.exportsFor === "function")
    ) {
      throw new VitestNativeTypeError(
        "INVALID_OPTION",
        `The preset module ${file} declares '${moduleName}' without a factory function and ` +
          `an exports array.`,
      );
    }
  }
  return preset;
}

/** The preset module paths the plugin passed this worker, absolute. */
export function presetModulePaths() {
  const raw = process.env.VITEST_NATIVE_PRESET_MODULES;
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new VitestNativeTypeError(
      "INVALID_OPTION",
      "VITEST_NATIVE_PRESET_MODULES, which the plugin sets for its setup file, is not valid JSON.",
      { cause },
    );
  }
}

/** Imports a preset module in a test worker, through Vitest so TypeScript loads. */
export async function importPresetModule(vi, file) {
  return presetFromModule(await vi.importActual(file), file);
}
