// Regression: an externalized ESM dependency that does a NAMED import of
// getter-based React Native exports (`import { Appearance } from 'react-native'`).
//
// RN's index exports everything via lazy getters (`module.exports = { get
// Appearance() {…} }`), which cjs-module-lexer can't surface as named exports when
// Node imports the CommonJS module from the ESM graph. Without the loader's ESM
// facade, importing `ext-rn-named-lib` throws "does not provide an export named
// 'Appearance'". (Surfaced by the obytes bake-off, where `uniwind` does exactly
// this and previously needed a manual `transform: ['uniwind']` workaround.)
import { describe, it, expect } from "vitest";
import { resolved } from "ext-rn-named-lib";

describe("externalized ESM lib importing getter-based RN named exports", () => {
  it("resolves the named imports via the loader's ESM facade", () => {
    expect(resolved.Appearance).toBe(true);
    expect(resolved.I18nManager).toBe(true);
    expect(resolved.Vibration).toBe(true);
  });
});
