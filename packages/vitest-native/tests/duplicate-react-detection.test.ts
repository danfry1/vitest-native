/**
 * Two copies of React produce `Cannot read properties of null (reading 'use')`, which
 * React Native Testing Library surfaces as a failure to detect host component names
 * with no mention of React at all. `resolve.dedupe` prevents the common case; this
 * detector names the cases it cannot reach.
 *
 * The resolver is injected, so the duplicate case is exercised without building a
 * broken node_modules tree — which is the only reason this is testable at all.
 */
import { describe, expect, it } from "vitest";
import { findDuplicateReact } from "../src/plugin.js";

const resolver =
  (table: Record<string, string | undefined>) =>
  (specifier: string, from: string): string | null =>
    table[`${from}::${specifier}`] ?? null;

describe("findDuplicateReact", () => {
  it("reports nothing when every consumer shares the project's React", () => {
    const resolve = resolver({
      "/app::react/package.json": "/app/node_modules/react/package.json",
      "/app::@testing-library/react-native/package.json": "/app/node_modules/rntl/package.json",
      "/app/node_modules/rntl/package.json::react/package.json":
        "/app/node_modules/react/package.json",
    });
    expect(findDuplicateReact(resolve, "/app", ["@testing-library/react-native"])).toBeNull();
  });

  it("reports the consumer holding a second copy", () => {
    const resolve = resolver({
      "/app::react/package.json": "/app/node_modules/react/package.json",
      "/app::@testing-library/react-native/package.json": "/app/node_modules/rntl/package.json",
      "/app/node_modules/rntl/package.json::react/package.json":
        "/app/node_modules/rntl/node_modules/react/package.json",
    });
    const found = findDuplicateReact(resolve, "/app", ["@testing-library/react-native"]);
    expect(found).toEqual({
      projectCopy: "/app/node_modules/react/package.json",
      otherCopy: "/app/node_modules/rntl/node_modules/react/package.json",
      consumer: "@testing-library/react-native",
    });
  });

  it("skips consumers that are not installed rather than reporting them", () => {
    const resolve = resolver({
      "/app::react/package.json": "/app/node_modules/react/package.json",
    });
    expect(findDuplicateReact(resolve, "/app", ["react-test-renderer"])).toBeNull();
  });

  it("stays silent when the project itself has no React", () => {
    // A pure-logic suite with no React at all must not be warned at.
    expect(findDuplicateReact(() => null, "/app", ["react-native"])).toBeNull();
  });

  it("checks every consumer, not just the first", () => {
    const resolve = resolver({
      "/app::react/package.json": "/app/node_modules/react/package.json",
      "/app::@testing-library/react-native/package.json": "/app/node_modules/rntl/package.json",
      "/app/node_modules/rntl/package.json::react/package.json":
        "/app/node_modules/react/package.json",
      "/app::react-native/package.json": "/app/node_modules/rn/package.json",
      "/app/node_modules/rn/package.json::react/package.json":
        "/app/node_modules/rn/node_modules/react/package.json",
    });
    const found = findDuplicateReact(resolve, "/app", [
      "@testing-library/react-native",
      "react-native",
    ]);
    expect(found?.consumer).toBe("react-native");
  });
});
