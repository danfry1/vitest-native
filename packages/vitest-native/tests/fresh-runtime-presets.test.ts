import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { freshRuntimeDeclinedNotice, presetsHoldingReact } from "../src/fresh-runtime-presets";

// Which active presets make hotRuntime.freshRuntime decline (#719): those whose served
// module uses React through vitest-native's resident dist.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bare = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-fresh-presets-")));
fs.writeFileSync(path.join(bare, "package.json"), JSON.stringify({ name: "bare" }));
afterAll(() => fs.rmSync(bare, { recursive: true, force: true }));

describe("presets holding React per worker", () => {
  it("counts the built-in presets that use React, and no others", () => {
    expect(
      presetsHoldingReact(["navigation", "netInfo", "asyncStorage", "worklets", "skia"], bare),
    ).toEqual(["navigation"]);
  });

  it("counts safe-area only while it serves its built-in module", () => {
    // This package's install ships react-native-safe-area-context's own built mock.
    expect(presetsHoldingReact(["safeAreaContext"], packageRoot)).toEqual([]);
    // Without the installed library, the preset serves its built-in module.
    expect(presetsHoldingReact(["safeAreaContext"], bare)).toEqual(["safeAreaContext"]);
  });

  it("counts reanimated and bottomSheet whichever module they serve", () => {
    expect(presetsHoldingReact(["reanimated", "bottomSheet"], packageRoot)).toEqual([
      "reanimated",
      "bottomSheet",
    ]);
  });

  it("names them in one line", () => {
    expect(freshRuntimeDeclinedNotice(["navigation"])).toBe(
      "[vitest-native] hotRuntime.freshRuntime declined: navigation holds React per worker (#719). React stays resident, as without freshRuntime.",
    );
    expect(freshRuntimeDeclinedNotice(["navigation", "svg"])).toContain(
      "navigation, svg hold React",
    );
  });
});
