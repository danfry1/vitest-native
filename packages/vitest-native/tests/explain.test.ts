import { describe, it, expect } from "vitest";
// @ts-expect-error — runtime .mjs
import {
  packageNameFromPath,
  decorateTransformError,
  explainUntransformedSyntaxError,
} from "../src/native/explain.mjs";

describe("packageNameFromPath", () => {
  it("extracts plain and scoped package names from node_modules paths", () => {
    expect(packageNameFromPath("/p/node_modules/react-native-svg/src/index.js")).toBe(
      "react-native-svg",
    );
    expect(packageNameFromPath("/p/node_modules/@op/lib/dist/a.js")).toBe("@op/lib");
  });

  it("uses the DEEPEST node_modules segment (nested installs)", () => {
    expect(packageNameFromPath("/p/node_modules/a/node_modules/@s/b/x.js")).toBe("@s/b");
  });

  it("handles Windows separators and returns null outside node_modules", () => {
    expect(packageNameFromPath("C:\\p\\node_modules\\lib\\index.js")).toBe("lib");
    expect(packageNameFromPath("/p/src/app.js")).toBeNull();
  });
});

describe("decorateTransformError", () => {
  it("names the package, file, and platform, and chains the cause", () => {
    const orig = new SyntaxError("Unexpected token (3:14)");
    const err = decorateTransformError(orig, "/p/node_modules/some-lib/a.js", "android");
    expect(err.message).toContain("'some-lib'");
    expect(err.message).toContain("/p/node_modules/some-lib/a.js");
    expect(err.message).toContain("platform 'android'");
    expect(err.message).toContain("Unexpected token (3:14)");
    expect(err.cause).toBe(orig);
    expect(err.name).toBe("SyntaxError");
  });

  it("still explains files outside node_modules without a package hint", () => {
    const err = decorateTransformError(new Error("boom"), "/p/src/x.js", "ios");
    expect(err.message).toContain("/p/src/x.js");
    expect(err.message).not.toContain("transform: [");
  });
});

describe("explainUntransformedSyntaxError", () => {
  const jsxErr = () => {
    const e = new SyntaxError("Unexpected token '<'");
    return e;
  };

  it("suggests transform: ['pkg'] for a JSX SyntaxError in node_modules", () => {
    const out = explainUntransformedSyntaxError(jsxErr(), "/p/node_modules/uniwind/dist/x.js");
    expect(out).not.toBeNull();
    expect(out.message).toContain("transform: ['uniwind']");
    expect(out.message).toContain("untranspiled JSX, Flow, or TypeScript");
    expect(out.name).toBe("SyntaxError");
  });

  it("returns null for non-syntax errors, app files, and unrelated syntax errors", () => {
    expect(explainUntransformedSyntaxError(new Error("ENOENT"), "/p/node_modules/a/x.js")).toBe(
      null,
    );
    expect(explainUntransformedSyntaxError(jsxErr(), "/p/src/app.js")).toBeNull();
    const unrelated = new SyntaxError("Cannot use import statement outside a module");
    expect(explainUntransformedSyntaxError(unrelated, "/p/node_modules/a/x.js")).toBeNull();
  });
});
