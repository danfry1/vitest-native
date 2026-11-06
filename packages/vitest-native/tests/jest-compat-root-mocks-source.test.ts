/**
 * The generated root-mocks module and Jest's modulePathIgnorePatterns, for values that are
 * not plain: a project root with regular-expression characters (Windows' `\`, a `+` in a
 * folder name) and file paths with characters that would end a string or a script in the
 * generated code.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ignorePattern } from "../src/jest-compat/root-mocks.js";
import { rootMocksSource } from "../src/jest-compat/transform.js";

describe("ignorePattern", () => {
  it("replaces <rootDir> with the root as literal text", () => {
    const root = path.join(path.sep, "work", "a+b (copy)");
    const regex = ignorePattern(
      "<rootDir>/legacy/".replaceAll("/", path.sep === "\\" ? "\\\\" : "/"),
      root,
    );
    expect(regex?.test(path.join(root, "legacy", "__mocks__", "x.js"))).toBe(true);
    // The unescaped root would read `a+b` as one or more `a` then `b`.
    expect(regex?.test(path.join(path.sep, "work", "aab (copy)", "legacy", "x.js"))).toBe(false);
  });

  it("is null for a pattern that is not a regular expression", () => {
    expect(ignorePattern("<rootDir>/(", "/work")).toBe(null);
  });
});

describe("rootMocksSource", () => {
  it("carries module names and file paths as string literals of their exact value", () => {
    const file = String.raw`C:\work\</script>` + "\u2028" + String.raw`\__mocks__\pkg.js`;
    const source = rootMocksSource(
      {
        root: String.raw`C:\work`,
        mocks: [{ spec: "pkg</script>", file, viaIndex: false }],
        duplicates: [],
      },
      () => null,
    );
    expect(source).not.toContain("</script>");
    expect(source).not.toContain("\u2028");
    const literals = [
      ...source.matchAll(
        /jest\.mock\(("(?:[^"\\]|\\.)*"), .*requireActual\(("(?:[^"\\]|\\.)*")\)/g,
      ),
    ];
    expect(literals).toHaveLength(1);
    const [, spec, required] = literals[0]!;
    expect(JSON.parse(spec)).toBe("pkg</script>");
    expect(JSON.parse(required)).toBe(file);
  });
});
