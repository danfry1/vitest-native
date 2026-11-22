import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { assertOneReact, presetFactoryContext, rendererRequire } from "../src/preset-react.mjs";
import { nestedReactProjects } from "./support/nested-react";

// A preset builds its mock with the React the test renders with: the copy react-native
// resolves. A React nested under the shadowed package is never used, since the preset
// replaces that package's code (#719 follow-up).
const projects = nestedReactProjects();
afterAll(() => projects.dispose());

describe("a preset factory's React", () => {
  it("is the copy react-native resolves, not one nested under the shadowed package", () => {
    const root = projects.project();
    const { React } = presetFactoryContext("shadowed-lib", root, { check: true });
    expect(React.copy).toBe("project");
    expect(rendererRequire(root)("react")).toBe(React);
  });

  it("is the project's copy where react-native is not installed", () => {
    const root = projects.project({ rn: false });
    expect(presetFactoryContext("shadowed-lib", root).React.copy).toBe("project");
  });

  it("follows react-native's own copy, and the check fails naming both", () => {
    const root = projects.project({ rnReact: true });
    expect(presetFactoryContext("shadowed-lib", root).React.copy).toBe("rn");
    expect(() => presetFactoryContext("shadowed-lib", root, { check: true })).toThrowError(
      expect.objectContaining({
        code: "PRESET_REACT_MISMATCH",
        message: expect.stringMatching(
          /the shadowed-lib preset builds its mock with the React react-native uses .*react-native[\\/]node_modules[\\/]react.*the project resolves another copy/s,
        ),
      }),
    );
  });

  it("has nothing to check where the anchor or the project resolves no React", () => {
    // Called from a resolver for any deduped name (react-is from prop-types, say): a
    // missing React is not a second copy, and the check must not throw Node's
    // MODULE_NOT_FOUND from inside that resolution.
    expect(() => assertOneReact(projects.project({ projectReact: false }))).not.toThrow();
    const rnOnly = projects.project({ projectReact: false, rnReact: true });
    expect(() => assertOneReact(rnOnly)).not.toThrow();
  });

  it("has nothing to hold the project to where react-native's directory resolves no React", () => {
    // An isolated install (pnpm, bun) whose react-native lacks its React peer: the
    // project has React, the anchor has none, and there is no copy to compare.
    const root = projects.project({ rn: false });
    const store = fs.mkdtempSync(path.join(os.tmpdir(), "vn-isolated-rn-"));
    try {
      const rn = path.join(store, "react-native");
      fs.mkdirSync(rn);
      fs.writeFileSync(path.join(rn, "package.json"), JSON.stringify({ name: "react-native" }));
      fs.symlinkSync(rn, path.join(root, "node_modules/react-native"), "junction");
      expect(() => assertOneReact(root)).not.toThrow();
    } finally {
      fs.rmSync(store, { recursive: true, force: true });
    }
  });

  it("fails when React Native Testing Library resolves another copy", () => {
    const root = projects.project({ rntlReact: true });
    expect(() => presetFactoryContext("shadowed-lib", root, { check: true })).toThrowError(
      expect.objectContaining({
        code: "PRESET_REACT_MISMATCH",
        message: expect.stringContaining("@testing-library/react-native resolves another copy"),
      }),
    );
  });
});

describe("assertOneReact", () => {
  it("names who uses react-native's copy, and fails again on every call", () => {
    const root = projects.project({ rnReact: true });
    for (let call = 0; call < 2; call++) {
      expect(() => assertOneReact(root, "Node's dedupe serves")).toThrowError(
        expect.objectContaining({
          code: "PRESET_REACT_MISMATCH",
          message: expect.stringContaining("Node's dedupe serves the React react-native uses"),
        }),
      );
    }
  });

  it("checks a root once, and a failed root fails again naming each caller", () => {
    const root = projects.project({ rntlReact: true });
    const resolves = countReactResolves(() => {
      expect(() => assertOneReact(root, "first caller")).toThrowError(/\] first caller the React/);
      expect(() => assertOneReact(root, "second caller")).toThrowError(
        /\] second caller the React/,
      );
    });
    expect(resolves).toBeGreaterThan(0);
    expect(countReactResolves(() => expect(() => assertOneReact(root)).toThrow())).toBe(0);
  });

  // A resolver step that asserts, as Node's React dedupe does, runs again for the check's
  // own resolutions of react: the nested call must not start another check.
  it("fails with its code, not a stack overflow, when called from Node's resolver", () => {
    const root = projects.project({ rnReact: true });
    const nodeResolve = (Module as any)._resolveFilename;
    (Module as any)._resolveFilename = function (request: string, ...rest: unknown[]) {
      if (request === "react") assertOneReact(root, "Node's dedupe serves");
      return nodeResolve.call(this, request, ...rest);
    };
    try {
      expect(() => assertOneReact(root, "Node's dedupe serves")).toThrowError(
        expect.objectContaining({ code: "PRESET_REACT_MISMATCH" }),
      );
    } finally {
      (Module as any)._resolveFilename = nodeResolve;
    }
  });

  it("passes where every copy agrees", () => {
    expect(() => assertOneReact(projects.project())).not.toThrow();
  });
});

function countReactResolves(run: () => void): number {
  const nodeResolve = (Module as any)._resolveFilename;
  let count = 0;
  (Module as any)._resolveFilename = function (request: string, ...rest: unknown[]) {
    if (request === "react") count++;
    return nodeResolve.call(this, request, ...rest);
  };
  try {
    run();
  } finally {
    (Module as any)._resolveFilename = nodeResolve;
  }
  return count;
}
