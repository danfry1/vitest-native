/**
 * Flow enums must survive the transform.
 *
 * React Native's Babel preset carries both `@babel/plugin-transform-flow-strip-types`
 * and `babel-plugin-transform-flow-enums`, but in separate `overrides` entries that
 * Babel merges into a single pass with strip-types first. It therefore deletes
 * `export enum Foo {}` as if it were a type annotation while leaving the code that
 * references Foo, producing a module that throws ReferenceError on a path nothing
 * warned about. Measured identical on preset 0.85.3 and 0.86.1, so it is the preset's
 * ordering rather than version skew.
 *
 * Only two React Native files use Flow enums today, both experimental, but any
 * ecosystem package using one would lose it just as silently.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const req = createRequire(import.meta.url);

describe("Flow enums survive the native transform", () => {
  it("keeps React Native's VirtualView enums defined and exported", () => {
    const mod = req("react-native/src/private/components/virtualview/VirtualView") as Record<
      string,
      unknown
    >;
    expect(Object.keys(mod)).toContain("VirtualViewMode");
    expect(Object.keys(mod)).toContain("VirtualViewRenderState");
  });

  it("exposes the enum through the react-native entry point", async () => {
    const RN = (await import("react-native")) as unknown as Record<string, unknown>;
    expect(RN.VirtualViewMode).toBeDefined();
  });

  it("produces a usable enum, not a bare placeholder", () => {
    const { VirtualViewMode } = req(
      "react-native/src/private/components/virtualview/VirtualView",
    ) as { VirtualViewMode: Record<string, unknown> };
    // Flow enums compile to an object with the members plus a `cast` helper, which
    // VirtualView itself calls — a stub that merely existed would still ReferenceError
    // one level down.
    expect(typeof VirtualViewMode.cast).toBe("function");
  });
});
