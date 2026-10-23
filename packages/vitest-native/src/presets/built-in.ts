import type { Preset } from "../types.js";

/**
 * Marks the presets vitest-native's own factories return. A test worker rebuilds a
 * built-in preset from its name, so an object that only shares the name, such as a
 * copy extended with modules of its own, would get the built-in's modules there; the
 * plugin refuses one without the mark. The mark is non-enumerable, so a spread copy
 * does not carry it, and its symbol is registered, so it holds across copies of this
 * module (an ESM and a CommonJS build loaded side by side).
 */
export const BUILT_IN_PRESET: unique symbol = Symbol.for("vitest-native.built-in-preset");

export function builtInPreset(preset: Preset): Preset {
  Object.defineProperty(preset, BUILT_IN_PRESET, { value: preset.name });
  return preset;
}
