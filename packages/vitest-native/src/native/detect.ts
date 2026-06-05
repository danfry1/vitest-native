import { createRequire } from "node:module";
import path from "node:path";

export type RequestedEngine = "auto" | "mock" | "native";
export type ResolvedEngine = "mock" | "native";

/**
 * Whether `auto` prefers native when the project supports it.
 * v0.x: false — `auto` resolves to mock (non-breaking) and nudges toward native.
 * v1.0: flip to true to make native the zero-config default (major release).
 */
export const AUTO_PREFERS_NATIVE = false;

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
    return {
      engine: "native",
      nativeAvailable,
      notice: "[vitest-native] engine: native (auto — found @react-native/babel-preset)",
    };
  }
  if (nativeAvailable) {
    return {
      engine: "mock",
      nativeAvailable,
      notice:
        "[vitest-native] native engine available — set engine:'native' for real-RN fidelity (becomes the default in v1)",
    };
  }
  return { engine: "mock", nativeAvailable: false, notice: null };
}
