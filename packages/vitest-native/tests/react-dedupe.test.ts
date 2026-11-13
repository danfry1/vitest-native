/**
 * Node serves React and its renderers as one copy, from the anchor the presets use
 * (react-native's resolution), as Vite's `resolve.dedupe` does for the files it loads.
 * A Node-owned library with its own nested React otherwise got a second copy.
 */
import Module, { createRequire } from "node:module";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { REACT_DEDUPE, installReactDedupe, isDeduped } from "../src/native/react-dedupe.mjs";
import { nestedReactProjects } from "./support/nested-react.js";

const projects = nestedReactProjects();
afterAll(() => projects.dispose());

type Resolve = (request: string, parent: unknown, ...rest: unknown[]) => string;
const nodeResolve = (Module as unknown as { _resolveFilename: Resolve })._resolveFilename;

/** The dedupe step over Node's own resolution, for `root`. */
function dedupeFor(root: string): Resolve {
  let step: Resolve | undefined;
  installReactDedupe(root, {
    resolve: {
      add: (_name: string, build: (next: Resolve) => Resolve) => (step = build(nodeResolve)),
    },
  });
  return step as Resolve;
}

/** A parent module at `file`, as Node passes one to `_resolveFilename`. */
function parentAt(file: string) {
  const paths = (
    Module as unknown as { _nodeModulePaths: (d: string) => string[] }
  )._nodeModulePaths(path.dirname(file));
  return { id: file, filename: file, paths };
}

const copyOf = (file: string) => (createRequire(file)(file) as { copy?: string }).copy;
const libIndex = (root: string) => path.join(root, "node_modules/react-shim-lib/index.js");

describe("Node's React dedupe", () => {
  it("serves a library with its own nested React the renderer's copy", () => {
    const root = projects.project({ libReact: true });
    const resolve = dedupeFor(root);
    expect(copyOf(nodeResolve("react", parentAt(libIndex(root))))).toBe("lib");
    expect(copyOf(resolve("react", parentAt(libIndex(root))))).toBe("project");
  });

  it("anchors where react-native resolves, and then holds the project to that copy", () => {
    const root = projects.project({ libReact: true, rnReact: true });
    expect(() => dedupeFor(root)("react", parentAt(libIndex(root)))).toThrowError(
      expect.objectContaining({
        code: "PRESET_REACT_MISMATCH",
        message: expect.stringMatching(
          /Node.s dedupe serves the React react-native uses .*react-native[\\/]node_modules[\\/]react/,
        ),
      }),
    );
  });

  it("holds React Native Testing Library to the same copy when it serves another", () => {
    const root = projects.project({ libReact: true, rntlReact: true });
    expect(() => dedupeFor(root)("react", parentAt(libIndex(root)))).toThrowError(
      expect.objectContaining({ code: "PRESET_REACT_MISMATCH" }),
    );
  });

  it("changes nothing, and checks nothing, where Node's answer is already the anchor's", () => {
    // RNTL nests a copy here, but no request is redirected, so the run is left alone.
    const root = projects.project({ libReact: true, rntlReact: true });
    const fromRoot = parentAt(path.join(root, "index.js"));
    expect(copyOf(dedupeFor(root)("react", fromRoot))).toBe("project");
  });

  it("leaves other packages, the main module and a missing anchor to Node", () => {
    const root = projects.project({ libReact: true });
    const resolve = dedupeFor(root);
    const fromLib = parentAt(libIndex(root));
    expect(resolve("react-native", fromLib)).toBe(nodeResolve("react-native", fromLib));
    expect(copyOf(resolve("react", fromLib, true))).toBe("lib");
    const bare = projects.project({ rn: false, libReact: true });
    expect(copyOf(dedupeFor(bare)("react", parentAt(libIndex(bare))))).toBe("project");
  });

  it("resolves the anchor once, without re-entering itself", () => {
    // Installed as Node's resolver, as in a worker: the anchor's own resolution goes
    // back through Module._resolveFilename and so through this step.
    const root = projects.project({ libReact: true });
    let calls = 0;
    const counted: Resolve = (...args) => {
      calls++;
      return nodeResolve(...args);
    };
    let step: Resolve | undefined;
    installReactDedupe(root, {
      resolve: {
        add: (_name: string, build: (next: Resolve) => Resolve) => (step = build(counted)),
      },
    });
    const node = Module as unknown as { _resolveFilename: Resolve };
    node._resolveFilename = step as Resolve;
    try {
      expect(copyOf(node._resolveFilename("react", parentAt(libIndex(root))))).toBe("project");
    } finally {
      node._resolveFilename = nodeResolve;
    }
    expect(calls).toBeLessThan(10);
  });

  it("dedupes Vite's list, names and subpaths", () => {
    expect(REACT_DEDUPE).toEqual(["react", "react-test-renderer", "test-renderer", "react-is"]);
    for (const request of ["react", "react/jsx-runtime", "react-is", "test-renderer/shallow"]) {
      expect(isDeduped(request)).toBe(true);
    }
    for (const request of ["react-native", "react-dom", "reactive", "react-isx"]) {
      expect(isDeduped(request)).toBe(false);
    }
  });
});
