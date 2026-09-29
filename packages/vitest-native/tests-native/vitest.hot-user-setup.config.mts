// Hot runtime + a project setup file that installs fake timers through jest-compat
// (see hot-user-setup/setup.ts). Single worker, fixed order, so every file after the
// first reuses the worker and depends on the previous file's state being reset before
// its setup files run. With the reset in this package's own setup file (which Vitest
// runs after the project's), every file after the first failed with
// "Can't install fake timers twice on the same global object".
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: { allowUnboundedMemory: true } })],
  test: {
    environment: "node",
    globals: true,
    setupFiles: [
      path.resolve(here, "../dist/jest-compat/setup.mjs"),
      path.resolve(here, "hot-user-setup/setup.ts"),
    ],
    include: ["tests-native/hot-user-setup/*.test.tsx"],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    sequence: { shuffle: false },
  },
});
