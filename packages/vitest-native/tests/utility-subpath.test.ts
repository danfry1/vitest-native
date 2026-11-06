import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { isUtilitySubpath } from "../src/native/match.mjs";

// A preset shadowing a package also shadows its subpaths, except the package's own test
// tooling, which loads from its real files (native/match.mjs, isUtilitySubpath).
describe("isUtilitySubpath", () => {
  it("leaves a package's jest/ directory to its real files", () => {
    // Reanimated's own Jest resolver requires worklets' by name while the worklets
    // preset is active.
    expect(isUtilitySubpath("react-native-worklets/jest/resolver")).toBe(true);
    expect(isUtilitySubpath("@scope/lib/jest/setup.js")).toBe(true);
  });

  it("shadows a package's other subpaths", () => {
    expect(isUtilitySubpath("react-native-worklets/lib/module/index")).toBe(false);
    expect(isUtilitySubpath("react-native-worklets/src/jest")).toBe(false);
    expect(isUtilitySubpath("jest")).toBe(false);
  });
});
