/**
 * registerVirtualTextHost against the two shapes of RNTL's
 * helpers/host-component-names module. Real React Native renders a nested <Text>
 * as the host "RCTVirtualText"; RNTL's text hosts omit it. The modules below are
 * reduced copies of the installed RNTL builds' exports, so this runs without the
 * native engine; tests-native/rntl.test.tsx covers each RNTL version end to end.
 */
import { describe, expect, it } from "vitest";
import { registerVirtualTextHost } from "../src/native/rntl-text-host.mjs";

const nested = { type: "RCTVirtualText" };
const outer = { type: "RCTText" };
const view = { type: "View" };

/** RNTL 14 (dist/): the list itself is exported. */
function rntl14() {
  const HOST_TEXT_NAMES = ["Text", "RCTText"];
  return {
    HOST_TEXT_NAMES,
    isHostText: (element: { type?: unknown } | null) =>
      typeof element?.type === "string" && HOST_TEXT_NAMES.includes(element.type),
  };
}

/** RNTL 13 (build/): a private list behind the exported predicate. */
function rntl13() {
  const HOST_TEXT_NAMES = ["Text", "RCTText"];
  const exports: Record<string, unknown> = {};
  exports.isHostText = (element: { type?: unknown } | null) =>
    typeof element?.type === "string" && HOST_TEXT_NAMES.includes(element.type);
  return exports;
}

/** RNTL 12 (build/): the predicate compares with the detected host name. */
function rntl12() {
  const getHostComponentNames = () => ({ text: "RCTText" });
  const exports: Record<string, unknown> = {};
  exports.isHostText = (element: { type?: unknown } | null) =>
    element?.type === getHostComponentNames().text;
  return exports;
}

type Predicate = (element: unknown) => boolean;

/** How Babel's CommonJS output calls an import: through the exports object. */
const callThroughExports = (mod: Record<string, unknown>, element: unknown) =>
  (0, mod.isHostText as Predicate)(element);

describe("registerVirtualTextHost", () => {
  it("adds RCTVirtualText to RNTL 14's list, once", () => {
    const mod = rntl14();
    expect(mod.isHostText(nested)).toBe(false);
    expect(registerVirtualTextHost(mod)).toBe("list");
    expect(registerVirtualTextHost(mod)).toBe("list");
    expect(mod.HOST_TEXT_NAMES).toEqual(["Text", "RCTText", "RCTVirtualText"]);
    expect(mod.isHostText(nested)).toBe(true);
  });

  for (const [version, make] of [
    ["13", rntl13],
    ["12", rntl12],
  ] as const) {
    it(`wraps RNTL ${version}'s isHostText so callers reading the export accept it`, () => {
      const mod = make();
      expect(callThroughExports(mod, nested)).toBe(false);
      expect(registerVirtualTextHost(mod)).toBe("predicate");
      expect(callThroughExports(mod, nested)).toBe(true);
      // Everything it accepted before, it still accepts, and nothing more.
      expect(callThroughExports(mod, outer)).toBe(true);
      expect(callThroughExports(mod, view)).toBe(false);
      expect(callThroughExports(mod, null)).toBe(false);
    });

    it(`wraps RNTL ${version}'s isHostText only once`, () => {
      const mod = make();
      registerVirtualTextHost(mod);
      const first = mod.isHostText;
      expect(registerVirtualTextHost(mod)).toBe("predicate");
      expect(mod.isHostText).toBe(first);
    });
  }

  it("reports an export it cannot replace as unpatched", () => {
    const mod = Object.freeze(rntl13());
    expect(registerVirtualTextHost(mod)).toBeNull();
    expect(callThroughExports(mod, nested)).toBe(false);
  });

  it("leaves a module with neither shape alone", () => {
    expect(registerVirtualTextHost({})).toBeNull();
    expect(registerVirtualTextHost(null)).toBeNull();
    expect(registerVirtualTextHost(undefined)).toBeNull();
  });
});
