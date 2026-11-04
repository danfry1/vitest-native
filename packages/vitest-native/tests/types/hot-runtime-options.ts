// Type-level checks for the hotRuntime option, compiled by tests/hot-runtime-types.test.ts.
// Every `@ts-expect-error` line must fail to compile; every other line must compile.
import type { VitestNativeOptions } from "../../src/types.js";

type HotRuntime = VitestNativeOptions["hotRuntime"];

export const accepted: HotRuntime[] = [
  false,
  true,
  "auto",
  { memoryLimit: 2 * 1024 ** 3 },
  { mode: "auto" },
  { mode: "auto", memoryLimit: 2 * 1024 ** 3, recycleAfterFiles: 50 },
  { mode: "auto", preserveGlobals: ["__STORYBOOK__"], esmGeneration: false },
];

// @ts-expect-error mode takes only "auto"
export const unknownMode: HotRuntime = { mode: "on" };
// @ts-expect-error mode is not a boolean
export const booleanMode: HotRuntime = { mode: true };
