import { describe, it, expect } from "vitest";
import { buildPkgMatcher } from "../src/native/match.mjs";

// Unit coverage for the native engine's `transform` allowlist matcher. The full
// end-to-end (a third-party Flow lib loading under engine:'native') is verified
// against a node_modules fixture in bench/; this guards the matching logic.
describe("native transform allowlist matcher", () => {
  it("matches files under a configured package, not lookalikes", () => {
    const m = buildPkgMatcher(["react-native-reanimated"]);
    expect(m("/p/node_modules/react-native-reanimated/src/mock.ts")).toBe(true);
    expect(m("/p/node_modules/react-native-reanimated-extra/index.js")).toBe(false);
    expect(m("/p/node_modules/react-native/Libraries/Foo.js")).toBe(false);
  });

  it("handles scoped package names and escapes regex specials", () => {
    const m = buildPkgMatcher(["@vnfix/flow-lib"]);
    expect(m("/p/node_modules/@vnfix/flow-lib/index.js")).toBe(true);
    expect(m("/p/node_modules/vnfix-flow-lib/index.js")).toBe(false);
  });

  it("an empty allowlist matches nothing", () => {
    const m = buildPkgMatcher([]);
    expect(m("/p/node_modules/anything/index.js")).toBe(false);
  });
});
