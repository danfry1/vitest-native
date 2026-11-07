// Type-level checks for the hotRuntime option, compiled by tests/hot-runtime-auto-options.test.ts.
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
  { mode: "auto", freshRuntime: true },
];

// @ts-expect-error mode takes only "auto"
export const unknownMode: HotRuntime = { mode: "on" };
// @ts-expect-error mode is not a boolean
export const booleanMode: HotRuntime = { mode: true };
// @ts-expect-error mode "auto" falls back where unbounded memory would be needed
export const autoUnbounded: HotRuntime = { mode: "auto", allowUnboundedMemory: true };
export const required: HotRuntime = { allowUnboundedMemory: true, memoryLimit: 1 };
