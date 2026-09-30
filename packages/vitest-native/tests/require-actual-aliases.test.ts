import path from "node:path";
import { describe, expect, it } from "vitest";
import { expandAlias, serializableAliases } from "../src/jest-compat/aliases.mjs";

describe("serializableAliases", () => {
  it("accepts both resolve.alias shapes and keeps only string-to-string entries", () => {
    const root = "/project";
    expect(serializableAliases({ "@": "/project/src", "~": "./app" }, root)).toEqual({
      entries: [
        ["@", "/project/src"],
        ["~", path.resolve(root, "./app")],
      ],
      skipped: [],
    });
    expect(
      serializableAliases(
        [
          { find: "@", replacement: "/project/src" },
          { find: /^#(.*)$/, replacement: "/project/$1" },
          { find: "custom", replacement: "/x", customResolver: () => null },
        ],
        root,
      ),
    ).toEqual({ entries: [["@", "/project/src"]], skipped: ["/^#(.*)$/", "custom"] });
  });

  it("returns nothing for a missing alias option", () => {
    expect(serializableAliases(undefined, "/project")).toEqual({ entries: [], skipped: [] });
  });
});

describe("expandAlias", () => {
  const entries: [string, string][] = [
    ["@", "/project/src"],
    ["@/components", "/project/ui/components"],
    ["~/", "/project/app"],
  ];

  it("expands an exact match and a prefix followed by '/'", () => {
    expect(expandAlias("@", entries)).toBe("/project/src");
    expect(expandAlias("@/services/api", entries)).toBe("/project/src/services/api");
  });

  it("does not let an '@' alias capture a scoped package", () => {
    expect(expandAlias("@scope/pkg", entries)).toBe("@scope/pkg");
    expect(expandAlias("@testing-library/react-native", entries)).toBe(
      "@testing-library/react-native",
    );
  });

  it("prefers the longest matching alias", () => {
    expect(expandAlias("@/components/Button", entries)).toBe("/project/ui/components/Button");
  });

  it("treats a find ending in '/' as a plain prefix", () => {
    expect(expandAlias("~/screens/Home", entries)).toBe("/project/app/screens/Home");
  });

  it("leaves unaliased specifiers untouched", () => {
    expect(expandAlias("react-native", entries)).toBe("react-native");
    expect(expandAlias("./local", entries)).toBe("./local");
  });
});
