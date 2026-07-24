import { describe, it, expect } from "vitest";
import lib from "rn-condition-lib";
import mainField from "rn-mainfield-lib";

describe("React Native package resolution", () => {
  it("resolves the react-native condition, not the web build", () => {
    // Vite's `resolve.conditions` governs the client environment; Vitest runs tests
    // in the ssr environment, which keeps its own list. Setting only the former left
    // this condition unapplied, so a package shipping separate React Native and web
    // builds silently served the web one — the wrong code under test, with nothing
    // to indicate it. Metro applies this condition, so the engine must too.
    expect(lib.entry).toBe("native");
  });

  it("resolves the legacy react-native main field, not the web build", () => {
    // Packages published before `exports` point at their native build with a
    // top-level "react-native" field, and Metro resolves it ahead of "main". Vite
    // drops mainFields for the ssr environment just as it drops conditions, so this
    // needs setting where the tests resolve.
    expect(mainField.entry).toBe("native");
  });
});
