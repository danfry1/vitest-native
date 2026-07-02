/**
 * Cross-file twin of preset-subpath.test.tsx. Under the hot runtime the worker
 * (and any module-level caches in the require hooks) persists across test
 * files while preset mocks are rebuilt per file — whichever of the two files
 * runs later in a shared worker catches a stale subpath cache as an identity
 * mismatch between the deep import and the current file's root mock.
 */
import { describe, it, expect } from "vitest";

describe("preset subpath identity across hot-worker files", () => {
  it("CJS subpath leaf is the current file's root mock export", () => {
    const viaSubpath = require("react-native-gesture-handler/Swipeable");
    const root = require("react-native-gesture-handler");
    expect(viaSubpath.default).toBe(root.Swipeable);
  });

  it("repeated requires stay identity-stable within the file", () => {
    const a = require("react-native-gesture-handler/Swipeable");
    const b = require("react-native-gesture-handler/Swipeable");
    expect(a).toBe(b);
  });
});
