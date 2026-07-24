import { describe, it, expect } from "vitest";
import lib from "rn-condition-lib";

describe("package export conditions", () => {
  it("resolves the react-native condition, not the web build", () => {
    // Vite's `resolve.conditions` governs the client environment; Vitest runs tests
    // in the ssr environment, which keeps its own list. Setting only the former left
    // this condition unapplied, so a package shipping separate React Native and web
    // builds silently served the web one — the wrong code under test, with nothing
    // to indicate it. Metro applies this condition, so the engine must too.
    expect(lib.entry).toBe("native");
  });
});
