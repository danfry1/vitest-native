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
// Plain .mjs, like errors.mjs: the native engine's setup file loads it as shipped, and
// the plugin and the mock engine's setup bundle it.
import { VitestNativeTypeError } from "./errors.mjs";
import { projectContext } from "./context.mjs";

// The plugin and the native loader generate `export const <name> = ...` for each named
// export, so each must be a name a binding can have. `default` is the module object.
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const RESERVED = new Set(
  (
    "await break case catch class const continue debugger default delete do else enum " +
    "export extends false finally for function if implements import in instanceof " +
    "interface let new null package private protected public return static super switch " +
    "this throw true try typeof var void while with yield"
  ).split(" "),
);

/**
 * The preset a preset module exports: its default export, either a preset or a
 * function returning one (called with no arguments).
 */
export function presetFromModule(namespace, file) {
  const exported = namespace?.default;
  const preset = typeof exported === "function" ? exported() : exported;
  const isObject = (value) => value !== null && typeof value === "object";
  if (typeof preset?.then === "function") {
    throw new VitestNativeTypeError(
      "INVALID_OPTION",
      `The preset module ${file} default-exports an async function. The plugin reads the ` +
        `preset synchronously; put async work in the preset's prepare(), which the test ` +
        `workers await before any test file loads.`,
    );
  }
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
    for (const name of presetModule.exports ?? []) {
      if (typeof name !== "string" || !IDENTIFIER.test(name) || RESERVED.has(name)) {
        throw new VitestNativeTypeError(
          "INVALID_OPTION",
          `The preset module ${file} lists ${JSON.stringify(name)} among the exports of ` +
            `'${moduleName}'. Each must be a name a variable could have` +
            (name === "default"
              ? `; the default import is the whole module object the factory returns.`
              : `.`),
        );
      }
    }
  }
  return preset;
}

/** The preset module paths the plugin passed this worker, absolute. */
export function presetModulePaths() {
  return [...(projectContext()?.presetModules ?? [])];
}

/** Imports a preset module in a test worker, through Vitest so TypeScript loads. */
export async function importPresetModule(vi, file) {
  return presetFromModule(await vi.importActual(file), file);
}
