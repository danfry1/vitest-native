// jest.useFakeTimers() under projects whose test.fakeTimers names the APIs to fake. The
// project's choice holds, where jest-compat would otherwise fake queueMicrotask as Jest
// does (#835), and a toNotFake never collides with the call's own list (#892):
// - to-fake sets toFake;
// - to-not-fake sets toNotFake in its own config;
// - inherited gets toNotFake from this root config (`extends: true`); the other two
//   carry their own config and inherit nothing (`extends: false`).
// Otherwise as tests-native/vitest.config.mts runs.
import { defineConfig } from "vitest/config";
import base from "./vitest.config.mts";

const dir = "tests-native/jest-compat-fake-timers-project";
const toNotFake = ["Date", "performance"];

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    // What the inherited project takes from here: this file only, and the toNotFake.
    include: [`${dir}/to-not-fake.test.ts`],
    fakeTimers: { toNotFake },
    projects: [
      {
        ...base,
        extends: false,
        test: {
          ...base.test,
          name: "to-fake",
          fakeTimers: { toFake: ["setTimeout", "clearTimeout", "Date"] },
          include: [`${dir}/project-fake-timers.test.ts`],
        },
      },
      {
        ...base,
        extends: false,
        test: {
          ...base.test,
          name: "to-not-fake",
          fakeTimers: { toNotFake },
          include: [`${dir}/to-not-fake.test.ts`],
        },
      },
      { extends: true, test: { name: "inherited" } },
    ],
  },
});
