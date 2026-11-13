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

  it("passes where every copy agrees", () => {
    expect(() => assertOneReact(projects.project())).not.toThrow();
  });
});
