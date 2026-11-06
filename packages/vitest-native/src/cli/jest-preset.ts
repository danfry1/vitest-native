/**
 * A Jest preset's settings, read as Jest applies them, for migrate.
 *
 * Jest applies a preset under the project's config (jest-config `setupPreset`): the
 * project's keys win, setupFiles and setupFilesAfterEnv run the preset's files first,
 * moduleNameMapper tries the project's patterns first, and transform and globals merge.
 * A project-local preset is often a known one spread and extended
 * (`module.exports = { ...require('jest-expo/jest-preset') }`); migrate recognises it
 * as that preset, so it gets the same translation, and carries over what it adds.
 */
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { loadJestPreset } from "./jest-discovery.js";

/** The presets migrate translates by name, in the order a local preset is matched against. */
export const KNOWN_PRESETS = [
  "jest-expo",
  "jest-expo/ios",
  "jest-expo/android",
  "jest-expo/universal",
  "jest-expo/web",
  "jest-expo/node",
  "react-native",
  "@react-native/jest-preset",
] as const;

/** Keys the discovery translation reads from the preset itself (translateDiscovery). */
const DISCOVERY_KEYS = new Set([
  "testMatch",
  "testRegex",
  "testPathIgnorePatterns",
  "modulePathIgnorePatterns",
  "moduleFileExtensions",
  "roots",
]);

export interface ResolvedJestPreset {
  /** The name migrate translates: the preset as written, or the known preset a local one spreads. */
  name: string;
  /** How reports name it: `'./jest.preset.js' (jest-expo's preset)` for a recognised local one. */
  label: string;
  /** The loaded preset (as written), for the discovery translation; null if it did not load. */
  loaded: Record<string, unknown> | null;
  loadError?: string;
  /** Settings the preset adds beyond the known preset (all of them for an unknown preset). */
  own: Record<string, unknown>;
  known: boolean;
}

const isLocal = (preset: string) =>
  preset.startsWith(".") || preset.startsWith("<rootDir>") || path.isAbsolute(preset);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** What `local` sets beyond `base`: new keys, changed values, array items and entries `base` lacks. */
function beyond(
  local: Record<string, unknown>,
  base: Record<string, unknown>,
): Record<string, unknown> {
  const own: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(local)) {
    const from = base[key];
    if (isDeepStrictEqual(value, from)) continue;
    if (Array.isArray(value) && Array.isArray(from)) {
      // Prepended, appended or removed: the known preset's own items are its translation's job.
      own[key] = value.filter((item) => !from.some((f) => isDeepStrictEqual(f, item)));
    } else if (isPlainObject(value) && isPlainObject(from)) {
      own[key] = Object.fromEntries(
        Object.entries(value).filter(([k, v]) => !isDeepStrictEqual(v, from[k])),
      );
    } else {
      own[key] = value;
    }
  }
  return own;
}

/**
 * The known preset a local preset spreads: every key of the known preset is present,
 * and more of its values are kept than changed. The best match wins (jest-expo/ios
 * and jest-expo share keys).
 */
function recognise(
  root: string,
  local: Record<string, unknown>,
): { name: string; config: Record<string, unknown> } | undefined {
  let best: { name: string; config: Record<string, unknown>; kept: number } | undefined;
  for (const name of KNOWN_PRESETS) {
    const loaded = loadJestPreset(root, name);
    if (!("config" in loaded)) continue;
    const keys = Object.keys(loaded.config);
    if (keys.length === 0 || !keys.every((k) => k in local)) continue;
    const kept = keys.filter((k) => isDeepStrictEqual(local[k], loaded.config[k])).length;
    if (kept * 2 <= keys.length) continue;
    if (!best || kept > best.kept) best = { name, config: loaded.config, kept };
  }
  return best;
}

export function resolveJestPreset(root: string, preset: string): ResolvedJestPreset {
  const known = (KNOWN_PRESETS as readonly string[]).includes(preset);
  const loaded = loadJestPreset(root, preset);
  if (!("config" in loaded)) {
    return {
      name: preset,
      label: `'${preset}'`,
      loaded: null,
      loadError: loaded.error,
      own: {},
      known,
    };
  }
  const config = loaded.config as Record<string, unknown>;
  if (known) return { name: preset, label: `'${preset}'`, loaded: config, own: {}, known };
  const match = isLocal(preset) ? recognise(root, config) : undefined;
  const own = match ? beyond(config, match.config) : { ...config };
  for (const key of DISCOVERY_KEYS) delete own[key];
  // A preset of a preset is not followed by Jest either.
  delete own.preset;
  for (const [key, value] of Object.entries(own)) {
    if (
      (Array.isArray(value) && value.length === 0) ||
      (isPlainObject(value) && Object.keys(value).length === 0)
    ) {
      delete own[key];
    }
  }
  return match
    ? {
        name: match.name,
        label: `'${preset}' (${match.name}'s preset, spread)`,
        loaded: config,
        own,
        known: true,
      }
    : { name: preset, label: `'${preset}'`, loaded: config, own, known: false };
}

/** The project's config with the preset's settings under it, as jest-config's setupPreset merges them. */
export function withPresetSettings(
  config: Record<string, unknown>,
  own: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...own, ...config };
  for (const key of ["setupFiles", "setupFilesAfterEnv"]) {
    if (Array.isArray(own[key]) && Array.isArray(config[key])) {
      merged[key] = [...(own[key] as unknown[]), ...(config[key] as unknown[])];
    }
  }
  for (const key of ["moduleNameMapper", "transform", "globals"]) {
    if (isPlainObject(own[key]) && isPlainObject(config[key])) {
      merged[key] = { ...own[key], ...config[key] };
    }
  }
  // moduleNameMapper: the project's patterns are tried first, then the preset's.
  if (isPlainObject(own.moduleNameMapper) && isPlainObject(config.moduleNameMapper)) {
    merged.moduleNameMapper = {
      ...config.moduleNameMapper,
      ...Object.fromEntries(
        Object.entries(own.moduleNameMapper).filter(
          ([k]) => !(k in (config.moduleNameMapper as object)),
        ),
      ),
    };
  }
  return merged;
}
