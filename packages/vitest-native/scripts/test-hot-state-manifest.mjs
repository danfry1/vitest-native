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

// Entries registered by the jest-compat setup exist only in a run that uses it, so
// their mutation legs run the jest-compat isolation suite in hot mode instead.
const jestCompatArgs = [
  "--config",
  path.join("tests-native", "vitest.hot-jest-compat.config.mts"),
  "--mode",
  "hot",
];
const jestCompatEntries = new Set(["jest-compat.node-mocks"]);

function run(args, env) {
  const result = spawnSync(process.execPath, [vitestEntry, "run", ...args], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", ...env },
  });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

// Ordering. Each mutation leg below proves a restore is OBSERVABLE, which is blind
// to the order restores run in, and order was exactly #350: the jest-compat mock
// registry cleared after the React Native restores, so one file's
// `jest.mock(…, () => null)` broke the next file's reset. HOT_STATE_MANIFEST_ENTRIES
// declares the order; each run's restores are traced and must follow it. The
// jest-compat leg registers every built-in entry, so it sees the whole order.
const orderLegs = [
  { name: "hot isolation", args: ["--config", config], complete: false },
  { name: "hot jest-compat", args: jestCompatArgs, complete: true },
];
for (const leg of orderLegs) {
  const { status, output } = run(leg.args, { VITEST_NATIVE_HOT_STATE_TRACE: "1" });
  if (status !== 0) {
    throw new Error(`state-manifest order leg '${leg.name}' failed before checking:\n${output}`);
  }
  const traces = [...output.matchAll(/\[vitest-native\] state restore order: (.+)/g)].map((match) =>
    match[1].trim().split(", "),
  );
  if (traces.length === 0) {
    throw new Error(`state-manifest order leg '${leg.name}' traced no restores:\n${output}`);
  }
  for (const observed of traces) {
    const unknown = observed.filter((id) => !HOT_STATE_MANIFEST_ENTRIES.includes(id));
    if (unknown.length > 0) {
      throw new Error(
        `state-manifest entries missing from HOT_STATE_MANIFEST_ENTRIES: ${unknown.join(", ")}`,
      );
    }
    const declared = HOT_STATE_MANIFEST_ENTRIES.filter((id) => observed.includes(id));
    if (observed.join() !== declared.join()) {
      throw new Error(
        `state-manifest restores ran out of declared order (${leg.name}):\n` +
          `  declared: ${declared.join(", ")}\n  observed: ${observed.join(", ")}`,
      );
    }
    if (leg.complete && observed.length !== HOT_STATE_MANIFEST_ENTRIES.length) {
      const absent = HOT_STATE_MANIFEST_ENTRIES.filter((id) => !observed.includes(id));
      throw new Error(
        `state-manifest order leg '${leg.name}' never restored: ${absent.join(", ")}`,
      );
    }
  }
  console.log(`[vitest-native] restore order matches the declaration: ${leg.name}`);
}

for (const entry of HOT_STATE_MANIFEST_ENTRIES) {
  const args = jestCompatEntries.has(entry) ? jestCompatArgs : ["--config", config];
  const result = run(args, {
    // The registry resets RN's factory cache per file, so these fallback
    // restorers are intentionally redundant there. Disable the registry for
    // their mutation legs to prove the resident Node-owned RN path as well.
    ...(residentRnEntries.has(entry) ? { VITEST_NATIVE_NO_REGISTRY: "1" } : {}),
    // Internal mutation oracle: omit exactly one restore while leaving its
    // verifier active. This is deliberately not a user-facing option.
    VITEST_NATIVE_HOT_STATE_MUTATION: entry,
  });
  const { output } = result;
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
  `[vitest-native] state-manifest mutation gate passed: ${HOT_STATE_MANIFEST_ENTRIES.length} restore actions are observable and run in declared order`,
);
