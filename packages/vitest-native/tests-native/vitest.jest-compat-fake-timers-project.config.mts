// jest.useFakeTimers() under a project whose test.fakeTimers names the APIs to fake: the
// project's choice holds, where jest-compat would otherwise fake queueMicrotask as Jest
// does (#835). Otherwise as tests-native/vitest.config.mts runs.
import { defineConfig } from "vitest/config";
import base from "./vitest.config.mts";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    fakeTimers: { toFake: ["setTimeout", "clearTimeout", "Date"] },
    include: ["tests-native/jest-compat-fake-timers-project/*.test.ts"],
  },
});
