// The engine's setup file runs before the project's own, however the project lists and
// sequences them (src/setup-files.ts). The project's setup file imports react-native at
// its top level; run before the engine's, it failed on React Native's Flow source
// ("SyntaxError: Unexpected token 'typeof'").
//   --mode list             plain test.setupFiles, Vitest's default sequence
//   --mode parallel         sequence.setupFiles: 'parallel'
//   --mode compat-parallel  jest-compat's setup listed first, then the project's, in parallel
import "./support/fresh-dist.mts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const userSetup = path.resolve(here, "setup-order/user-setup.ts");

export default defineConfig(({ mode }) => {
  if (mode !== "list" && mode !== "parallel" && mode !== "compat-parallel") {
    throw new Error(`run with --mode list, parallel or compat-parallel (got '${mode}')`);
  }
  const compat = mode === "compat-parallel";
  if (compat) process.env.VN_SETUP_ORDER_COMPAT = "1";
  return {
    plugins: [reactNative({ engine: "native" })],
    test: {
      globals: compat,
      setupFiles: compat
        ? [path.resolve(here, "../dist/jest-compat/setup.mjs"), userSetup]
        : [userSetup],
      ...(mode === "list" ? {} : { sequence: { setupFiles: "parallel" as const } }),
      include: ["tests-native/setup-order/*.test.tsx"],
      env: { VN_SETUP_ORDER_COMPAT: compat ? "1" : "0" },
    },
  };
});
