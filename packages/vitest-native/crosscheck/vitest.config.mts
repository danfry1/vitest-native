import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// The orchestrator (scripts/crosscheck.mjs) runs this config once per engine.
const engine = process.env.CROSSCHECK_ENGINE === "native" ? "native" : "mock";

export default defineConfig({
  plugins: [reactNative({ engine })],
  test: {
    globals: true,
    environment: "node",
    include: [path.join(here, "crosscheck.test.tsx")],
  },
});
