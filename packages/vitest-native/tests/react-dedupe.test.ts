/**
 * Node serves React and its renderers as one copy, from the anchor the presets use
 * (react-native's resolution), as Vite's `resolve.dedupe` does for the files it loads.
 * A Node-owned library with its own nested React otherwise got a second copy.
 */
import Module, { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REACT_DEDUPE,
  anchoredFile,
  installReactDedupe,
  isDeduped,
} from "../src/native/react-dedupe.mjs";
import { renderInitConfig } from "../src/cli/init.js";
import { analyzeJestConfig } from "../src/cli/migrate.js";
import { fixture } from "./support/migrate-fixtures.js";
import { nestedReactProjects } from "./support/nested-react.js";

const projects = nestedReactProjects();
afterAll(() => projects.dispose());
// These tests run under the plugin, whose context names this repository as the project:
// without it, the step serves the root it was installed for.
beforeEach(() => vi.stubEnv("VITEST_NATIVE_CONTEXT", ""));
afterEach(() => vi.unstubAllEnvs());

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

  it("holds the project to the anchor's copy even where no request is redirected", () => {
    // RNTL nests a copy here; the project's own request already resolves to the anchor.
    const root = projects.project({ libReact: true, rntlReact: true });
    const fromRoot = parentAt(path.join(root, "index.js"));
    expect(() => dedupeFor(root)("react", fromRoot)).toThrowError(
      expect.objectContaining({ code: "PRESET_REACT_MISMATCH" }),
    );
  });

  it("leaves a require.resolve with its own lookup paths to Node", () => {
    const root = projects.project({ libReact: true });
    const resolve = dedupeFor(root);
    const fromRoot = parentAt(path.join(root, "index.js"));
    const lib = path.join(root, "node_modules/react-shim-lib");
    expect(copyOf(resolve("react", fromRoot, false, { paths: [lib] }))).toBe("lib");
    // The parent's own paths, as require.resolve passes them, are a plain require.
    const fromLib = parentAt(libIndex(root));
    expect(copyOf(resolve("react", fromLib, false, { paths: fromLib.paths }))).toBe("project");
  });

  it("anchors each project root on its own", () => {
    const one = projects.project({ libReact: true });
    const two = projects.project({ libReact: true });
    const reactOf = (root: string) =>
      path.join(fs.realpathSync(root), "node_modules/react/index.js");
    expect(anchoredFile("react", one)).toBe(reactOf(one));
    expect(anchoredFile("react", two)).toBe(reactOf(two));
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
});

/** Resolve `request` with the dedupe step installed as Node's resolver, as in a worker. */
function asWorker(root: string, request: string, parent: unknown, counted?: { calls: number }) {
  const next: Resolve = (...args) => {
    if (counted) counted.calls++;
    return nodeResolve(...args);
  };
  let step: Resolve | undefined;
  installReactDedupe(root, {
    resolve: { add: (_name: string, build: (n: Resolve) => Resolve) => (step = build(next)) },
  });
  const node = Module as unknown as { _resolveFilename: Resolve };
  node._resolveFilename = step as Resolve;
  try {
    return node._resolveFilename(request, parent);
  } finally {
    node._resolveFilename = nodeResolve;
  }
}

describe("Node's React dedupe installed as Node's resolver", () => {
  it("resolves the anchor once, without re-entering itself", () => {
    // The anchor's own resolution goes back through Module._resolveFilename, and so
    // through this step.
    const root = projects.project({ libReact: true });
    const counted = { calls: 0 };
    expect(copyOf(asWorker(root, "react", parentAt(libIndex(root)), counted))).toBe("project");
    expect(counted.calls).toBeLessThan(10);
  });

  it("reports a project whose React is not the anchor's as a mismatch", () => {
    const root = projects.project({ libReact: true, rnReact: true });
    expect(() => asWorker(root, "react", parentAt(libIndex(root)))).toThrowError(
      expect.objectContaining({ code: "PRESET_REACT_MISMATCH" }),
    );
  });
});

describe("Node's React dedupe lists", () => {
  it("is the list the generated configs write", () => {
    const line = `dedupe: [${REACT_DEDUPE.map((name) => `'${name}'`).join(", ")}]`;
    expect(renderInitConfig(true)).toContain(line);
    const migrated = analyzeJestConfig(
      fixture({ "package.json": { jest: { preset: "react-native" } } }),
    ).suggestedConfig;
    expect(migrated).toContain(line);
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
