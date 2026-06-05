// Fidelity proof: captures observable behavior of modules that jest+RN-preset
// MOCKS but the vitest-native `native` engine runs FOR REAL. Run under each
// engine, then diff.mjs shows where the mock-based runners (jest, our `mock`)
// diverge from real RN — i.e. where they give false confidence.
//
// Uses global test/expect (present under both jest and vitest globals:true) so
// the one file runs unchanged on all three runners.
import React from "react";
import { render } from "@testing-library/react-native";
import { Linking, Text } from "react-native";
import fs from "node:fs";
import path from "node:path";

const ENGINE = process.env.FIDELITY_ENGINE || "unknown";

// Did the call validate its input (throw) or silently accept it?
function validates(fn: () => unknown): string {
  try {
    const r = fn();
    if (r && typeof (r as any).then === "function") {
      // Swallow async rejection; we only care that it did NOT throw synchronously.
      (r as any).then?.(
        () => {},
        () => {},
      );
      return "accepted (no validation)";
    }
    return "accepted (no validation)";
  } catch (e: any) {
    return "rejected: " + String(e?.message ?? e).split("\n")[0];
  }
}

test("capture fidelity probes", () => {
  const results: Record<string, unknown> = {};

  // Real Linking validates its input (invariant in _validateURL); the jest mock
  // and our mock are plain stubs that accept anything -> false-passing tests.
  results["Linking.openURL(123)"] = validates(() => (Linking.openURL as any)(123));
  results["Linking.openURL('')"] = validates(() => Linking.openURL(""));
  results["Linking.canOpenURL(null)"] = validates(() => (Linking.canOpenURL as any)(null));

  // Real Text computes host props (allowFontScaling, ellipsizeMode, accessible);
  // jest's Text mock renders a bare host without them.
  const { UNSAFE_root } = render(<Text>hi</Text>);
  let hostProps: Record<string, unknown> = {};
  const walk = (n: any) => {
    if (!n) return;
    if (typeof n.type === "string") hostProps = n.props ?? {};
    (n.children ?? []).forEach?.(walk);
  };
  walk(UNSAFE_root);
  results["Text real-RN host props"] = ["allowFontScaling", "ellipsizeMode", "accessible"]
    .filter((k) => k in hostProps)
    .sort();

  const outDir = path.join(process.cwd(), "fidelity");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `results.${ENGINE}.json`), JSON.stringify(results, null, 2));
});
