// Setups main runs that the project context must keep running, one project each:
//   threads, forks, hot   test.execArgv carries `--conditions=vn-probe`
//   node-options          test.env.NODE_OPTIONS carries it (forks)
//   esm-on, esm-off       the hot runtime with ESM generation on and off
// test:native:context runs them all, then `threads` under `node --conditions=vn-probe`.
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

const conditions = ["--conditions=vn-probe"];
const variant = (name: string, index: number) => {
  const hot = name === "hot" || name.startsWith("esm-");
  const env: Record<string, string> = {};
  if (name === "node-options") env.NODE_OPTIONS = conditions.join(" ");
  if (name.startsWith("esm-")) env.VN_EXPECT_ESM_GENERATION = name === "esm-on" ? "1" : "0";
  return {
    extends: false as const,
    root: import.meta.dirname + "/..",
    plugins: [
      reactNative({
        engine: "native",
        hotRuntime: hot ? (name === "esm-off" ? { esmGeneration: false } : true) : false,
      }),
    ],
    test: {
      name,
      environment: "node",
      include: ["tests-native/context/*.test.tsx"],
      env,
      // Each its own group: a hot project cannot share a group with a stock one.
      sequence: { groupOrder: index },
      ...(name === "forks" || name === "node-options" ? { pool: "forks" as const } : {}),
      ...(["threads", "forks", "hot"].includes(name) ? { execArgv: conditions } : {}),
    },
  };
};

export default defineConfig({
  test: {
    // Two workers, so the hot runtime is not declined on a small machine.
    maxWorkers: 2,
    projects: ["threads", "forks", "hot", "node-options", "esm-on", "esm-off"].map(variant),
  },
});
