import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * The Babel preset the native engine compiles React Native and node_modules with,
 * resolved from the project: the preset the project's Metro applies when the project
 * has no Babel config of its own.
 *
 * - `@react-native/babel-preset`: React Native CLI projects, and Expo before SDK 56,
 *   whose babel-preset-expo depends on it.
 * - `expo/internal/babel-preset` (babel-preset-expo): Expo from SDK 56. Its
 *   babel-preset-expo carries React Native's plugins itself and no longer depends on
 *   @react-native/babel-preset, so a project created from an SDK 56+ template has none
 *   installed. Expo's Metro (@expo/metro-config, loadBabelConfig) and jest-expo
 *   (src/resolveBabelOptions.js) load this preset in a project without a Babel config.
 *
 * The React Native preset is tried first, so a project that has it keeps compiling
 * exactly as before. Null when neither resolves.
 *
 * @param {string} projectRoot
 * @returns {{ name: string, file: string, version: string, packageDir: string } | null}
 */
export function resolveTransformPreset(projectRoot) {
  const req = createRequire(path.join(projectRoot, "package.json"));
  try {
    const manifest = req.resolve("@react-native/babel-preset/package.json");
    return {
      name: "@react-native/babel-preset",
      // Babel loads a preset named by its package directory through the package's
      // own entry, as it would the bare name.
      file: path.dirname(manifest),
      version: readVersion(manifest),
      packageDir: path.dirname(manifest),
    };
  } catch {
    // Not a React Native preset project; try Expo's.
  }
  try {
    const file = req.resolve("expo/internal/babel-preset");
    // The re-export requires babel-preset-expo, which expo depends on.
    const manifest = createRequire(file).resolve("babel-preset-expo/package.json");
    return {
      name: "babel-preset-expo",
      file,
      version: readVersion(manifest),
      packageDir: path.dirname(manifest),
    };
  } catch {
    return null;
  }
}

function readVersion(manifest) {
  return JSON.parse(fs.readFileSync(manifest, "utf8")).version;
}
