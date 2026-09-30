import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { HOT_STATE_MANIFEST_ENTRIES } from "../src/native/state-manifest.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(packageRoot, "package.json"));
const vitestRoot = path.dirname(require.resolve("vitest/package.json"));
const vitestEntry = path.join(vitestRoot, "vitest.mjs");
const config = path.join("tests-native", "vitest.hot-isolation.config.mts");
const residentRnEntries = new Set([
  "react-native.dimensions",
  "react-native.appearance",
  "react-native.event-listeners",
]);

for (const entry of HOT_STATE_MANIFEST_ENTRIES) {
  const result = spawnSync(process.execPath, [vitestEntry, "run", "--config", config], {
    cwd: packageRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      // The registry resets RN's factory cache per file, so these fallback
      // restorers are intentionally redundant there. Disable the registry for
      // their mutation legs to prove the resident Node-owned RN path as well.
      ...(residentRnEntries.has(entry) ? { VITEST_NATIVE_NO_REGISTRY: "1" } : {}),
      // Internal mutation oracle: omit exactly one restore while leaving its
      // verifier active. This is deliberately not a user-facing option.
      VITEST_NATIVE_HOT_STATE_MUTATION: entry,
    },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error) throw result.error;
  if (result.status === 0) {
    throw new Error(
      `state-manifest mutation '${entry}' did not fail the adversarial isolation suite`,
    );
  }
  if (!output.includes("hotRuntime state restoration failed") || !output.includes(entry)) {
    throw new Error(
      `state-manifest mutation '${entry}' failed without the named restoration error:\n${output}`,
    );
  }
  console.log(`[vitest-native] mutation rejected: ${entry}`);
}

console.log(
  `[vitest-native] state-manifest mutation gate passed: ${HOT_STATE_MANIFEST_ENTRIES.length} restore actions are observable`,
);
