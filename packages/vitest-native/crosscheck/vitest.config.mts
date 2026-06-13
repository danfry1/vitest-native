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
    // Forward slashes: `include` entries are globs (tinyglobby treats "\" as an
    // escape char, not a path separator), so a raw Windows path never matches.
    include: [path.join(here, "crosscheck.test.tsx").replaceAll("\\", "/")],
  },
});
