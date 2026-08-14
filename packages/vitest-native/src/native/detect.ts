import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

export type RequestedEngine = "auto" | "mock" | "native";
export type ResolvedEngine = "mock" | "native";

/**
 * Whether `auto` prefers native when the project supports it.
 * true (since 0.4.0) — native is the zero-config default: `reactNative()` runs
 * real React Native whenever @react-native/babel-preset + @babel/core resolve.
 * Falls back to the mock engine only when those deps are absent (with a notice).
 * `engine: 'mock'` remains an explicit opt-in for pure-logic / no-RN-install runs.
 */
export const AUTO_PREFERS_NATIVE = true;

export interface EngineDecision {
  engine: ResolvedEngine;
  /** True when react-native + @react-native/babel-preset + @babel/core resolve from projectRoot. */
  nativeAvailable: boolean;
  /** The native-engine dependencies that did NOT resolve, in check order. */
  missing: string[];
  /** One concise line to print once, or null for silence. */
  notice: string | null;
}

/**
 * The native engine's dependencies that do NOT resolve from the project root.
 *
 * react-native itself is part of the check: the Babel toolchain alone chose
 * native mode in a project with the preset installed but no react-native — an
 * incomplete install, a babel-only workspace — which then failed later at RN
 * resolution with nothing pointing at the cause. Resolution, not declaration:
 * every check walks node_modules upward from the root — so a hoisted workspace
 * install or Expo's transitive react-native counts, and a project does not need
 * react-native in its own manifest.
 */
function missingNativeDeps(projectRoot: string): string[] {
  const req = createRequire(path.join(projectRoot, "package.json"));
  const missing: string[] = [];
  // react-native is located by walking node_modules up from the root — the same
  // places require() would look — rather than through the require machinery,
  // which this package's own engines intercept for the react-native specifier
  // (the mock engine's CJS bridge answers `req.resolve("react-native")` from ANY
  // root, which would make this check unconditionally true under it).
  if (!reactNativeInstalledNear(projectRoot)) missing.push("react-native");
  for (const dep of ["@react-native/babel-preset", "@babel/core"]) {
    try {
      req.resolve(dep);
    } catch {
      missing.push(dep);
    }
  }
  return missing;
}

/** Does node_modules/react-native exist in projectRoot or any ancestor? */
function reactNativeInstalledNear(projectRoot: string): boolean {
  let dir = path.resolve(projectRoot);
  for (;;) {
    if (fs.existsSync(path.join(dir, "node_modules", "react-native", "package.json"))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

/** Resolve the concrete engine for a run. Pure; never throws. */
export function detectEngine(
  requested: RequestedEngine,
  projectRoot: string,
  opts?: { autoPrefersNative?: boolean },
): EngineDecision {
  const missing = missingNativeDeps(projectRoot);
  const nativeAvailable = missing.length === 0;

  if (requested === "native") return { engine: "native", nativeAvailable, missing, notice: null };
  if (requested === "mock") return { engine: "mock", nativeAvailable, missing, notice: null };

  // requested === "auto"
  const prefersNative = opts?.autoPrefersNative ?? AUTO_PREFERS_NATIVE;
  if (prefersNative && nativeAvailable) {
    // The happy path (real RN, deps present) is silent — elegance is no chatter.
    return { engine: "native", nativeAvailable, missing, notice: null };
  }
  if (prefersNative) {
    // Wanted native but can't: explain the fallback so the mock engine is never
    // a silent surprise, naming exactly what did not resolve. (Silent when the
    // user explicitly asked for mock above.)
    return {
      engine: "mock",
      nativeAvailable: false,
      missing,
      notice:
        `[vitest-native] ${missing.join(", ")} not found — using the mock engine. ` +
        "Install what's missing to run real React Native, or set engine:'mock' to silence this.",
    };
  }
  // autoPrefersNative explicitly disabled → mock, no notice.
  return { engine: "mock", nativeAvailable, missing, notice: null };
}
