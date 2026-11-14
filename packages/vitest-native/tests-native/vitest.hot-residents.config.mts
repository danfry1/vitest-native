// The resident-state audit (scripts/test-hot-residents.mjs). The same probe files run under
// per-file isolation (--mode isolation), the hot runtime (--mode hot) and hot with
// freshRuntime (--mode fresh), on one worker in name order. Each probe's second file
// records what it observed, so the script can compare the modes resident by resident.
// VN_RESIDENT_AUDIT_GROUP picks the probe directory: `batch`, or a solo pair whose
// carry-over would reach every later file on the worker.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { reactNative } from "../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const MODES = ["isolation", "hot", "fresh"];

class ByName extends BaseSequencer {
  override async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => (a.moduleId < b.moduleId ? -1 : 1));
  }
}

export default defineConfig(({ mode }) => {
  if (!MODES.includes(mode)) throw new Error(`run with --mode ${MODES.join("|")} (got '${mode}')`);
  const group = process.env.VN_RESIDENT_AUDIT_GROUP ?? "batch";
  // The inventory's stash crosses file boundaries as a preserved global, so it is itself
  // a declared resident (hot-residents.json). The inventory self-check pins one more.
  const preserveGlobals = ["__VN_RESIDENT_AUDIT__"];
  if (process.env.VN_RESIDENT_AUDIT_PIN_UNLISTED === "1") preserveGlobals.push("__VN_UNLISTED__");
  return {
    plugins: [
      reactNative({
        engine: "native",
        // No presets: a preset whose module holds React per worker makes freshRuntime
        // decline (#719), and the fresh leg must measure freshRuntime itself.
        presets: [],
        hotRuntime:
          mode === "isolation"
            ? false
            : { allowUnboundedMemory: true, freshRuntime: mode === "fresh", preserveGlobals },
      }),
    ],
    test: {
      environment: "node",
      include: [`tests-native/hot-residents/${group}/*.test.{ts,tsx}`],
      setupFiles: mode === "isolation" ? [] : [path.join(here, "hot-residents/inventory.setup.ts")],
      maxWorkers: 1,
      fileParallelism: false,
      sequence: { sequencer: ByName },
      env: { VN_RESIDENT_AUDIT_MODE: mode },
    },
  };
});
