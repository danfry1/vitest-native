// Whether a request names its own extension, as Metro decides it (#506): only a known
// source or asset extension counts, not whatever follows the last dot.
import { describe, expect, it } from "vitest";
// @ts-expect-error: runtime .mjs without declarations
import { hasKnownExtension } from "../src/native/resolve.mjs";

const sourceExts = ["js", "jsx", "json", "ts", "tsx"];
const assetExts = new Set(["png", "ttf", "svg"]);

describe("hasKnownExtension", () => {
  it.each([
    ["./Linking.types", false],
    ["./Theme.config", false],
    ["./web.styles", false],
    ["./impl", false],
    ["./index.ts", true],
    ["./icon.png", true],
    ["./Icon.PNG", true],
    ["./x.svg", true],
    ["./data.json", true],
    ["./module.mjs", true],
    ["./module.cjs", true],
    ["./addon.node", true],
    ["/abs/path/Kind.types", false],
  ])("%s → %s", (request, expected) => {
    expect(hasKnownExtension(request, sourceExts, assetExts)).toBe(expected);
  });

  it("reads source extensions with or without a leading dot, from the project's list", () => {
    expect(hasKnownExtension("./Thing.mts", [".mts"], new Set())).toBe(true);
    expect(hasKnownExtension("./Thing.mts", sourceExts, assetExts)).toBe(false);
  });
});
