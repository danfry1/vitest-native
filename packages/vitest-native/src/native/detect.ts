import { createRequire } from "node:module";
import path from "node:path";

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
  /** True when @react-native/babel-preset + @babel/core resolve from projectRoot. */
  nativeAvailable: boolean;
  /** One concise line to print once, or null for silence. */
  notice: string | null;
}

/** Can this project run the native engine? (Both transform deps resolvable.) */
function isNativeCapable(projectRoot: string): boolean {
  try {
    const req = createRequire(path.join(projectRoot, "package.json"));
    req.resolve("@react-native/babel-preset");
    req.resolve("@babel/core");
    return true;
  } catch {
    return false;
  }
}

/** Resolve the concrete engine for a run. Pure; never throws. */
export function detectEngine(
  requested: RequestedEngine,
  projectRoot: string,
  opts?: { autoPrefersNative?: boolean },
): EngineDecision {
  const nativeAvailable = isNativeCapable(projectRoot);

  if (requested === "native") return { engine: "native", nativeAvailable, notice: null };
  if (requested === "mock") return { engine: "mock", nativeAvailable, notice: null };

  // requested === "auto"
  const prefersNative = opts?.autoPrefersNative ?? AUTO_PREFERS_NATIVE;
  if (prefersNative && nativeAvailable) {
    // The happy path (real RN, deps present) is silent — elegance is no chatter.
    return { engine: "native", nativeAvailable, notice: null };
  }
  if (prefersNative) {
    // Wanted native but can't: explain the fallback so the mock engine is never
    // a silent surprise. (Silent when the user explicitly asked for mock above.)
    return {
      engine: "mock",
      nativeAvailable: false,
      notice:
        "[vitest-native] @react-native/babel-preset not found — using the mock engine. " +
        "Install it (and @babel/core) to run real React Native, or set engine:'mock' to silence this.",
    };
  }
  // autoPrefersNative explicitly disabled → mock, no notice.
  return { engine: "mock", nativeAvailable, notice: null };
}
