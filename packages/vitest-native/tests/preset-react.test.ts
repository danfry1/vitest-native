import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { presetFactoryContext } from "../src/preset-react.mjs";

// A preset builds its mock with the React the test renders with: the copy react-native
// resolves. A React nested under the shadowed package is never used, since the preset
// replaces that package's code (#719 follow-up).
const roots: string[] = [];

function pkg(dir: string, name: string, copy?: string) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, main: "index.js" }));
  fs.writeFileSync(
    path.join(dir, "index.js"),
    `module.exports = ${JSON.stringify(copy ? { copy } : {})};`,
  );
}

function project(layout: { rnReact?: boolean; rntlReact?: boolean; rn?: boolean }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-preset-react-"));
  roots.push(root);
  const modules = path.join(root, "node_modules");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
  pkg(path.join(modules, "react"), "react", "project");
  if (layout.rn !== false) pkg(path.join(modules, "react-native"), "react-native");
  if (layout.rnReact) pkg(path.join(modules, "react-native/node_modules/react"), "react", "rn");
  // The shadowed package nests its own React (a dependency, not a peer).
  pkg(path.join(modules, "shadowed-lib"), "shadowed-lib");
  pkg(path.join(modules, "shadowed-lib/node_modules/react"), "react", "nested");
  if (layout.rntlReact) {
    pkg(path.join(modules, "@testing-library/react-native"), "@testing-library/react-native");
    pkg(path.join(modules, "@testing-library/react-native/node_modules/react"), "react", "rntl");
  }
  return root;
}

afterAll(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

describe("a preset factory's React", () => {
  it("is the copy react-native resolves, not one nested under the shadowed package", () => {
    const { React } = presetFactoryContext("shadowed-lib", project({}), { check: true });
    expect(React.copy).toBe("project");
  });

  it("is the project's copy where react-native is not installed", () => {
    expect(presetFactoryContext("shadowed-lib", project({ rn: false })).React.copy).toBe("project");
  });

  it("follows react-native's own copy, and the check fails naming both", () => {
    const root = project({ rnReact: true });
    expect(presetFactoryContext("shadowed-lib", root).React.copy).toBe("rn");
    expect(() => presetFactoryContext("shadowed-lib", root, { check: true })).toThrowError(
      expect.objectContaining({
        code: "PRESET_REACT_MISMATCH",
        message: expect.stringMatching(
          /shadowed-lib preset.*react-native[\\/]node_modules[\\/]react.*the project resolves another copy/s,
        ),
      }),
    );
  });

  it("fails when React Native Testing Library resolves another copy", () => {
    const root = project({ rntlReact: true });
    expect(() => presetFactoryContext("shadowed-lib", root, { check: true })).toThrowError(
      expect.objectContaining({
        code: "PRESET_REACT_MISMATCH",
        message: expect.stringContaining("@testing-library/react-native resolves another copy"),
      }),
    );
  });
});
