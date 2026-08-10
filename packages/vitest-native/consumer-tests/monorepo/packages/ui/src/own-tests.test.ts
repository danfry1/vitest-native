/**
 * A workspace library's OWN tests, run from inside it — the reported failure, exactly.
 *
 * `@consumer/ui` is depended on by the app, so auto-detection saw it as an ecosystem
 * package and externalized its directory. That is right when the app is under test,
 * and wrong for the files in this directory when the library itself is: Vitest handed
 * this file to Node, the loader compiled it to CommonJS, and the import below became
 * `require('vitest')`:
 *
 *     Error: Vitest cannot be imported in a CommonJS module using require().
 *     Test Files 1 failed | Tests: no tests
 *
 * Because it depended on whether anything happened to declare the package, it struck
 * one workspace package and not another with an identical config. Nothing here opts
 * in: no jest-compat, no transform list, no manual externalization.
 *
 * The harness runs this twice, from this directory and from the workspace root (how
 * Nx invokes tasks). The two take different routes through the fix — from here the
 * package is not detected at all; from the root it still is, and the test entry is
 * kept in Vitest's graph regardless.
 */
import { Platform } from "react-native";
import { describe, expect, it } from "vitest";

describe("a workspace library's own test files", () => {
  it("loads with an explicit import from 'vitest'", () => {
    // Reaching this body is the assertion: it means the import above resolved to
    // Vitest's ESM entry instead of throwing on its CommonJS one. Written explicitly
    // rather than with globals, because the explicit form is the one that failed —
    // with globals the same broken setup reports a pass.
    expect(typeof it).toBe("function");
  });

  it("still runs against real React Native", () => {
    // The library is React Native code; the engine must still be live here, not
    // sidestepped by whatever keeps the entry out of Node's graph.
    expect(Platform.OS).toBe("ios");
  });
});
