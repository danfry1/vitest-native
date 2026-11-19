/**
 * A jest.mock factory's object is the whole module, as under Jest. When a module Node
 * loads calls an export the factory left out, the load fails naming the mock and the
 * export, instead of only "(0 , _core.requireOptional) is not a function" from inside
 * the package (#886: expo-constants under a partial jest.mock('expo-modules-core')).
 * The missing export is never filled in.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { MANUAL_MOCK_FACTORY, nodeRegistry } from "../src/jest-compat/node-registry.mjs";

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-partial-")));
const write = (rel: string, text: string) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};
write("package.json", '{ "name": "app" }');
const setupFile = write("src/setup.js", "");
const appFile = write("src/app.js", "");
write("node_modules/core/package.json", '{ "name": "core", "main": "index.js" }');
write(
  "node_modules/core/index.js",
  "exports.requireOptional = () => null; exports.Emitter = class {};",
);
// What Babel makes of `import { requireOptional } from 'core'` at the top of a module.
const consumer = (name: string, body: string) => {
  write(`node_modules/${name}/package.json`, `{ "name": "${name}", "main": "index.js" }`);
  return write(`node_modules/${name}/index.js`, body);
};
consumer(
  "calls-missing",
  'var _core = require("core");\nmodule.exports = (0, _core.requireOptional)("Native");\n',
);
consumer(
  "constructs-missing",
  'var _core = require("core");\nmodule.exports = new _core.Emitter();\n',
);
consumer(
  "own-bug",
  'require("core");\nvar _other = {};\nmodule.exports = (0, _other.requireOptional)();\n',
);

// `outer` is served the mock and then loads `inner`, whose own `_core` is not the mock.
consumer("inner", "var _core = {};\nmodule.exports = (0, _core.requireOptional)();\n");
consumer("outer", 'var _core = require("core");\nrequire("inner");\nmodule.exports = _core;\n');
const manualMock = write("__mocks__/core.js", "exports.Emitter = function Emitter() {};");

const registry = nodeRegistry();
const load = createRequire(appFile);
const loadFresh = (name: string) => {
  for (const id of Object.keys(require.cache)) if (id.startsWith(root)) delete require.cache[id];
  return load(name);
};
afterEach(() => registry.clear());
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const caught = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error as Error & { code?: string; cause?: unknown };
  }
  throw new Error("expected the load to throw");
};

describe("a module Node loads under a partial jest.mock", () => {
  it("names the mock, the file that registered it and the missing export", () => {
    registry.register(setupFile, "core", () => ({ Emitter: function Emitter() {} }));
    const error = caught(() => loadFresh("calls-missing"));
    expect(error.code).toBe("JEST_MOCK_MISSING_EXPORT");
    expect(error).toBeInstanceOf(TypeError);
    expect(error.message).toContain("requireOptional");
    expect(error.message).toContain("jest.mock('core')");
    expect(error.message).toContain(setupFile);
    expect(error.message).toContain(path.join("calls-missing", "index.js"));
    expect(error.message).toContain("jest.requireActual('core')");
    expect(String((error.cause as Error)?.message)).toMatch(/requireOptional\) is not a function/);
  });

  // A test file registers its mocks by its file URL.
  it("names the registering file as a path", () => {
    registry.register(pathToFileURL(setupFile).href, "core", () => ({}));
    const error = caught(() => loadFresh("calls-missing"));
    expect(error.message).toContain(`factory in ${setupFile} `);
  });

  it("names a constructor the mock left out", () => {
    registry.register(setupFile, "core", () => ({ requireOptional: () => null }));
    const error = caught(() => loadFresh("constructs-missing"));
    expect(error.code).toBe("JEST_MOCK_MISSING_EXPORT");
    expect(error.message).toContain("Emitter");
  });

  it("leaves the export out rather than filling it in", () => {
    const mock = { Emitter: function Emitter() {} };
    registry.register(setupFile, "core", () => mock);
    caught(() => loadFresh("calls-missing"));
    expect(Object.keys(mock)).toEqual(["Emitter"]);
  });

  it("loads as before when the mock has the export", () => {
    registry.register(setupFile, "core", () => ({ requireOptional: () => "mocked" }));
    expect(loadFresh("calls-missing")).toBe("mocked");
  });

  it("leaves a module's own error alone when the mock is not what lacks the export", () => {
    registry.register(setupFile, "core", () => ({ requireOptional: () => null }));
    const error = caught(() => loadFresh("own-bug"));
    expect(error.code).toBeUndefined();
    expect(error.message).toMatch(/_other\.requireOptional\) is not a function/);
  });

  // The call goes through another module's binding, so the mock lacking the name is
  // not why it failed.
  it("leaves a module's own error alone when the call is not through the mock", () => {
    registry.register(setupFile, "core", () => ({ Emitter: function Emitter() {} }));
    const error = caught(() => loadFresh("own-bug"));
    expect(error.code).toBeUndefined();
  });

  // The mock has the export, as something other than a function: not a missing export.
  it("leaves the error alone when the mock exports the name", () => {
    registry.register(setupFile, "core", () => ({ requireOptional: 5 }));
    const error = caught(() => loadFresh("calls-missing"));
    expect(error.code).toBeUndefined();
    expect(error.message).toMatch(/requireOptional\) is not a function/);
  });

  it("names the module whose code threw, not a module that loaded it", () => {
    registry.register(setupFile, "core", () => ({}));
    const error = caught(() => loadFresh("outer"));
    expect(error.code).toBeUndefined();
    expect(error.message).toMatch(/_core\.requireOptional\) is not a function/);
  });

  // jest.doMock with a new factory: the error names the factory that is now the mock.
  it("names the current factory, not one it replaced", () => {
    registry.register(setupFile, "core", () => ({}));
    caught(() => loadFresh("calls-missing"));
    registry.register(appFile, "core", () => ({}));
    const error = caught(() => loadFresh("calls-missing"));
    expect(error.message).toContain(`factory in ${appFile} `);
  });

  // jest.resetModules(): what each file was served before the reset is forgotten with it.
  it("forgets what was served at jest.resetModules()", () => {
    registry.register(setupFile, "core", () => ({ requireOptional: () => "mocked" }));
    loadFresh("calls-missing");
    expect(registry.served.size).toBeGreaterThan(0);
    registry.resetModules();
    expect(registry.served.size).toBe(0);
  });

  it("names a manual mock's file", () => {
    const factory = { [MANUAL_MOCK_FACTORY]: () => load(manualMock) }[MANUAL_MOCK_FACTORY];
    registry.register(appFile, "core", factory);
    const error = caught(() => loadFresh("calls-missing"));
    expect(error.code).toBe("JEST_MOCK_MISSING_EXPORT");
    expect(error.message).toContain(`the manual mock of 'core' (${manualMock})`);
  });

  it("leaves the same error alone with no mock", () => {
    const error = caught(() => loadFresh("own-bug"));
    expect(error.code).toBeUndefined();
  });
});
