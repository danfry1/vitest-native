/**
 * The packed library-floor gate checks each run's engine banner, not only its test
 * count, so a run that fell back to the mock engine or ran per-file instead of hot
 * cannot pass (scripts/support/engine-banner.mjs). The banners are the plugin's shapes.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { floorBannerProblem } from "../scripts/support/engine-banner.mjs";

const native = (rest: string) =>
  `x\n[vitest-native] engine: native — real react-native@0.86.3${rest}\ny`;
const NATIVE = native(" (platform ios)");
const NATIVE_HOT = native(" · mocked: react-native-reanimated (platform ios, hot runtime)");
const MOCK =
  "[vitest-native] engine: mock — React Native reimplementation, cross-checked against real RN (platform ios)";

describe("floorBannerProblem", () => {
  it("accepts the engine and runtime a row asked for", () => {
    expect(floorBannerProblem(NATIVE, { engine: "native" }, "0.86.3")).toBeUndefined();
    expect(
      floorBannerProblem(NATIVE_HOT, { engine: "native", hot: true }, "0.86.3"),
    ).toBeUndefined();
    expect(floorBannerProblem(MOCK, { engine: "mock" }, "0.86.3")).toBeUndefined();
  });

  it("rejects a fallback to the mock engine, another React Native, or no banner", () => {
    expect(floorBannerProblem(MOCK, { engine: "native" }, "0.86.3")).toContain("expected real");
    // 0.86.30 must not pass for 0.86.3.
    expect(
      floorBannerProblem(native("0 (platform ios)"), { engine: "native" }, "0.86.3"),
    ).toContain("expected real");
    expect(floorBannerProblem(NATIVE, { engine: "mock" }, "0.86.3")).toContain("mock engine");
    expect(floorBannerProblem("1 passed", { engine: "native" }, "0.86.3")).toBe("no engine banner");
  });

  it("rejects a hot row that ran per-file, and a per-file row that ran hot", () => {
    expect(floorBannerProblem(NATIVE, { engine: "native", hot: true }, "0.86.3")).toContain(
      "hot runtime",
    );
    expect(floorBannerProblem(NATIVE_HOT, { engine: "native" }, "0.86.3")).toContain("per-file");
  });
});
