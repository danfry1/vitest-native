# Native Engine (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in `engine: 'native'` mode to the `reactNative()` Vitest plugin that runs *real* React Native JS (mocking only the native boundary), producing the authentic `RCTView`/`RCTText` host tree — with default isolation. Existing `mock` behaviour is unchanged and remains the default.

**Architecture:** The native engine externalizes `react-native`/`@react-native` so they load through Node's single CJS module graph. Two transform hooks intercept that graph: a Node ESM **loader hook** (`module.register`) for vite-node's top-level `import()`, and a `Module._extensions['.js']` hook for RN's internal `require()` chains. Both Flow-strip RN files via the project's `@react-native/babel-preset` (disk-cached) and serve a small set of **native-boundary mock modules**. This is the design validated end-to-end in `packages/vitest-native/.tmp-spike2/` (reference implementation).

**Tech Stack:** TypeScript, Vite/Vitest plugin API, Node `module` (`register`, `Module._extensions`, `Module._resolveFilename`), `@react-native/babel-preset` + `@babel/core` (resolved from the *user's* project), `react-test-renderer` (transitional renderer).

**Out of scope for Phase 0 (later phases):** the `isolate: false` shared-runtime speed mode and its state-reset logic (Phase 0b); reusing Meta's `react-native/jest/mocks/*` via a shim (Phase 1); `auto`/per-glob selection (Phase 2). Phase 0 ships `engine: 'native'` correct-but-default-isolated, plus `engine: 'mock'` (current) and `engine: 'auto'` (resolves to `mock`).

**Reference:** `docs/superpowers/specs/2026-06-03-vitest-native-dual-engine-design.md` and the working spike at `packages/vitest-native/.tmp-spike2/` (`loader.mjs`, `setup.mjs`).

---

## File Structure

All paths under `packages/vitest-native/`.

**Native runtime (plain `.mjs`, shipped as-is; run in Node/worker context):**
- Create `src/native/transform.mjs` — `transformRN(file, src, projectRoot)` + disk cache. Used by both hooks.
- Create `src/native/boundary.mjs` — `BOUNDARY_SOURCES` map + `boundarySourceFor(normPath)`. The ~7 native-boundary mock modules as CJS source strings (so both hooks can serve them identically).
- Create `src/native/resolve.mjs` — `resolvePlatformFile(absBase)` for `.ios.js`/`.native.js`/`.js`.
- Create `src/native/globals.mjs` — `installGlobals()`: `__DEV__`, RAF, `__fbBatchedBridgeConfig`, etc.
- Create `src/native/hooks.mjs` — `installRequireHooks(projectRoot)`: patches `Module._extensions['.js']` + `Module._resolveFilename`.
- Create `src/native/loader.mjs` — ESM loader (`resolve` + `load`) for `module.register`.
- Create `src/native/setup.mjs` — native setup file: `installGlobals()`, `register('./loader.mjs')`, `installRequireHooks()`.

**TypeScript (built by tsdown):**
- Create `src/native/apply.ts` — `nativeEngineConfig(setupPath)` returns the Vite config fragment for native mode.
- Modify `src/types.ts` — add `engine` to `VitestNativeOptions`.
- Modify `src/validate.ts:4` — add `"engine"` to `KNOWN_OPTIONS`.
- Modify `src/plugin.ts` — branch `config()` on engine; make mock-only hooks no-op under native.
- Modify `tsdown.config.ts` — copy the `src/native/*.mjs` runtime into `dist/native/`.
- Modify `package.json` — add optional peer deps + ensure `dist/native` ships.

**Tests:**
- Create `tests-native/vitest.config.mts` — config applying `reactNative({ engine: 'native' })`.
- Create `tests-native/render.test.tsx` — real-RN render integration tests.
- Create `tests/native-unit.test.ts` — unit tests for `transform`/`boundary`/`resolve` helpers (runs under the default mock-engine config; pure-function tests).

---

## Task 1: Add the `engine` option (types + validation)

**Files:**
- Modify: `src/types.ts:210-249` (add `engine` to `VitestNativeOptions`), `src/types.ts:251-258` (add to `ResolvedOptions`)
- Modify: `src/validate.ts:4`
- Test: `tests/validation.test.ts` (existing file — add cases)

- [ ] **Step 1: Write failing tests for option acceptance + unknown-option behaviour**

Add to `tests/validation.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { reactNative } from "../src/index.js";

describe("engine option", () => {
  it("accepts engine: 'native' without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reactNative({ engine: "native" });
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("Unknown option 'engine'"));
    warn.mockRestore();
  });

  it("accepts engine: 'mock' and 'auto'", () => {
    expect(() => reactNative({ engine: "mock" })).not.toThrow();
    expect(() => reactNative({ engine: "auto" })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/vitest-native && bunx vitest run tests/validation.test.ts -t "engine option"`
Expected: FAIL — `engine` triggers the unknown-option warning (not yet in `KNOWN_OPTIONS`).

- [ ] **Step 3: Add `engine` to the types**

In `src/types.ts`, inside `VitestNativeOptions` (after `platform?`):

```ts
  /**
   * Test engine.
   * - 'mock'   — pure-JS reimplementation of React Native (fastest, lower fidelity).
   * - 'native' — runs real React Native JS, mocking only the native boundary
   *              (Jest-level fidelity).
   * - 'auto'   — picks an engine automatically. Currently resolves to 'mock'.
   * Default: 'auto'.
   */
  engine?: "auto" | "mock" | "native";
```

In `ResolvedOptions` add:

```ts
  engine: "mock" | "native";
```

- [ ] **Step 4: Add `engine` to KNOWN_OPTIONS**

In `src/validate.ts:4`:

```ts
const KNOWN_OPTIONS = ["platform", "presets", "mocks", "diagnostics", "assetExts", "engine"];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/vitest-native && bunx vitest run tests/validation.test.ts -t "engine option"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/vitest-native/src/types.ts packages/vitest-native/src/validate.ts packages/vitest-native/tests/validation.test.ts
git commit -m "feat(native): add engine option to plugin types + validation"
```

---

## Task 2: Native transform module (Flow-strip + disk cache)

**Files:**
- Create: `src/native/transform.mjs`
- Test: `tests/native-unit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/native-unit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
// @ts-expect-error — runtime .mjs, no types
import { transformRN } from "../src/native/transform.mjs";

// IMPORTANT: this unit test runs under the default (mock-engine) Vitest config,
// where the reactNative() plugin intercepts `react-native/*` resolution — even
// through node:module's createRequire under vite-node. So `require.resolve(
// "react-native/package.json")` returns a VIRTUAL id, not the real disk path.
// Resolve the real on-disk dir via the node_modules symlink + realpathSync instead.
// (@babel/core and @react-native/babel-preset are NOT intercepted, so transformRN's
// own resolution works fine — only this test's RN-file lookup needs this.)
function resolveRNRoot(): string {
  let dir = process.cwd();
  for (;;) {
    const pkg = path.join(dir, "node_modules", "react-native", "package.json");
    if (fs.existsSync(pkg)) return path.dirname(fs.realpathSync(pkg));
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("react-native not found from " + process.cwd());
    dir = parent;
  }
}
const RN = resolveRNRoot();
const projectRoot = process.cwd();

describe("transformRN", () => {
  it("lowers RN 0.84 Flow component syntax to runnable JS", () => {
    const file = path.join(RN, "Libraries/Components/View/View.js");
    const src = fs.readFileSync(file, "utf8");
    expect(/\bcomponent\s+View\(/.test(src)).toBe(true); // source uses component syntax
    const out = transformRN(file, src, projectRoot);
    expect(out).not.toMatch(/\bcomponent\s+View\(/); // lowered
    expect(out).not.toMatch(/import typeof/);
  });

  it("returns identical output on a second (cached) call", () => {
    const file = path.join(RN, "Libraries/StyleSheet/StyleSheet.js");
    const src = fs.readFileSync(file, "utf8");
    const a = transformRN(file, src, projectRoot);
    const b = transformRN(file, src, projectRoot);
    expect(b).toBe(a);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/vitest-native && bunx vitest run tests/native-unit.test.ts`
Expected: FAIL — `transform.mjs` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/native/transform.mjs`:

```js
// Flow-strips a React Native source file via the project's @react-native/babel-preset
// (the only transformer that lowers RN's `component` syntax). Disk-cached by
// path + mtime + size + preset version. Used by BOTH the loader hook (import) and
// the require hook — they run in separate threads, so this module is stateless.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";

let _babel;
let _preset;
let _cacheDir;
const mem = new Map();

function init(projectRoot) {
  if (_babel) return;
  const req = createRequire(path.join(projectRoot, "package.json"));
  try {
    _babel = req("@babel/core");
    _preset = req.resolve("@react-native/babel-preset");
  } catch {
    throw new Error(
      "[vitest-native] engine 'native' requires '@react-native/babel-preset' and " +
        "'@babel/core' in your project. Install them as devDependencies " +
        "(they ship with React Native projects by default).",
    );
  }
  const presetVersion = req("@react-native/babel-preset/package.json").version;
  _cacheDir = path.join(os.tmpdir(), "vitest-native-cache", presetVersion);
  fs.mkdirSync(_cacheDir, { recursive: true });
}

/** Returns true if the source contains RN Flow syntax that must be transformed. */
export function isFlow(src) {
  return /@flow|import typeof|\bcomponent\s+\w/.test(src);
}

/** Transform an RN source file to runnable CJS. Cached in-memory + on disk. */
export function transformRN(file, src, projectRoot) {
  init(projectRoot);
  const memHit = mem.get(file);
  if (memHit !== undefined) return memHit;

  const st = fs.statSync(file);
  const key = crypto.createHash("sha1").update(file + ":" + st.mtimeMs + ":" + st.size).digest("hex");
  const cachePath = path.join(_cacheDir, key + ".js");
  try {
    const cached = fs.readFileSync(cachePath, "utf8");
    mem.set(file, cached);
    return cached;
  } catch {}

  const out = _babel.transformSync(src, {
    filename: file,
    presets: [_preset],
    babelrc: false,
    configFile: false,
    caller: { name: "metro", bundler: "metro", platform: "ios", supportsStaticESM: false },
  }).code;
  fs.writeFileSync(cachePath, out);
  mem.set(file, out);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/vitest-native && bunx vitest run tests/native-unit.test.ts -t transformRN`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add packages/vitest-native/src/native/transform.mjs packages/vitest-native/tests/native-unit.test.ts
git commit -m "feat(native): Flow-strip transform with disk cache"
```

---

## Task 3: Native boundary mock modules

**Files:**
- Create: `src/native/boundary.mjs`
- Test: `tests/native-unit.test.ts` (add cases)

- [ ] **Step 1: Write the failing test**

Add to `tests/native-unit.test.ts`:

```ts
// @ts-expect-error — runtime .mjs
import { boundarySourceFor, isBoundary } from "../src/native/boundary.mjs";
import Module from "node:module";

function evalCjs(source: string): any {
  const m = new Module("boundary-test", null);
  // @ts-expect-error internal
  m._compile(source, "/virtual/boundary-test.js");
  return m.exports;
}

describe("native boundary", () => {
  it("identifies boundary modules by suffix", () => {
    expect(isBoundary("/x/react-native/Libraries/TurboModule/TurboModuleRegistry.js")).toBe(true);
    expect(isBoundary("/x/react-native/Libraries/StyleSheet/StyleSheet.js")).toBe(false);
  });

  it("TurboModuleRegistry mock never throws and returns constants", () => {
    const src = boundarySourceFor("/x/react-native/Libraries/TurboModule/TurboModuleRegistry.js");
    const mod = evalCjs(src!);
    expect(typeof mod.getEnforcing).toBe("function");
    const dev = mod.getEnforcing("DeviceInfo");
    expect(dev.getConstants().Dimensions.window.width).toBe(390);
  });

  it("requireNativeComponent mock returns a host component factory", () => {
    const src = boundarySourceFor("/x/react-native/Libraries/ReactNative/requireNativeComponent.js");
    const mod = evalCjs(src!);
    expect(typeof mod.default).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/vitest-native && bunx vitest run tests/native-unit.test.ts -t "native boundary"`
Expected: FAIL — `boundary.mjs` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/native/boundary.mjs`:

```js
// The native boundary: the small set of React Native modules that touch native
// code, replaced with mocks. Everything ELSE in RN runs for real. Modules are
// expressed as CJS source strings so both transform hooks (loader + require) can
// serve them identically. Mirrors react-native/jest/setup.js's mock set.

const DEVICE_CONSTANTS = JSON.stringify({
  PlatformConstants: {
    forceTouchAvailable: false,
    reactNativeVersion: { major: 0, minor: 84, patch: 1 },
    osVersion: "17.0",
    systemName: "iOS",
    interfaceIdiom: "phone",
    isTesting: true,
  },
  DeviceInfo: {
    Dimensions: {
      window: { width: 390, height: 844, scale: 3, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 3, fontScale: 1 },
    },
  },
});

// A reusable mock-native-component factory, inlined into each source string that needs it.
const MOCK_NATIVE_COMPONENT = `
  const React = require("react");
  let __tag = 1;
  const mockNativeComponent = (viewName) => {
    const C = class extends React.Component {
      constructor(p) { super(p); this._nativeTag = __tag++; }
      render() { return React.createElement(viewName, this.props, this.props.children); }
      blur() {} focus() {} measure() {} measureInWindow() {} measureLayout() {} setNativeProps() {}
    };
    C.displayName = viewName === "RCTView" ? "View" : viewName;
    return C;
  };
`;

const TURBO_STUB = `
  const __C = ${DEVICE_CONSTANTS};
  const turboStub = (name) => new Proxy({}, {
    get: (_t, p) => (p === "getConstants" ? () => (__C[name] || {}) : () => undefined),
  });
`;

export const BOUNDARY_SOURCES = {
  "Libraries/TurboModule/TurboModuleRegistry.js": `
    ${TURBO_STUB}
    exports.get = (n) => turboStub(n);
    exports.getEnforcing = (n) => turboStub(n);
  `,
  "Libraries/BatchedBridge/NativeModules.js": `
    ${TURBO_STUB}
    module.exports = { __esModule: true, default: new Proxy({}, {
      get: (_t, n) => (typeof n === "string" ? turboStub(n) : undefined),
    }) };
  `,
  "Libraries/NativeComponent/NativeComponentRegistry.js": `
    ${MOCK_NATIVE_COMPONENT}
    exports.get = (n) => mockNativeComponent(n);
    exports.getWithFallback_DEPRECATED = (n) => mockNativeComponent(n);
    exports.setRuntimeConfigProvider = () => {};
  `,
  "Libraries/ReactNative/requireNativeComponent.js": `
    ${MOCK_NATIVE_COMPONENT}
    module.exports = { __esModule: true, default: (n) => mockNativeComponent(n) };
  `,
  "Libraries/Components/View/ViewNativeComponent.js": `
    ${MOCK_NATIVE_COMPONENT}
    module.exports = { __esModule: true, default: mockNativeComponent("RCTView"), __INTERNAL_VIEW_CONFIG: {}, Commands: {} };
  `,
  "Libraries/Core/InitializeCore.js": `module.exports = { __esModule: true, default: {} };`,
  "Libraries/ReactNative/UIManager.js": `
    module.exports = { __esModule: true, default: new Proxy(
      { getViewManagerConfig: () => ({}), hasViewManagerConfig: () => true, getConstants: () => ({}) },
      { get: (t, p) => (p in t ? t[p] : () => undefined) }
    ) };
  `,
};

const SUFFIXES = Object.keys(BOUNDARY_SOURCES);

/** Normalised-path test: is this a native-boundary module? */
export function isBoundary(normPath) {
  return SUFFIXES.some((s) => normPath.endsWith("/react-native/" + s));
}

/** Returns the CJS source for a boundary module, or null if not a boundary. */
export function boundarySourceFor(normPath) {
  for (const s of SUFFIXES) {
    if (normPath.endsWith("/react-native/" + s)) return BOUNDARY_SOURCES[s];
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/vitest-native && bunx vitest run tests/native-unit.test.ts -t "native boundary"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/vitest-native/src/native/boundary.mjs packages/vitest-native/tests/native-unit.test.ts
git commit -m "feat(native): native-boundary mock modules as CJS source"
```

---

## Task 4: Platform-extension resolver

**Files:**
- Create: `src/native/resolve.mjs`
- Test: `tests/native-unit.test.ts` (add cases)

- [ ] **Step 1: Write the failing test**

Add to `tests/native-unit.test.ts`:

```ts
// @ts-expect-error — runtime .mjs
import { resolvePlatformFile } from "../src/native/resolve.mjs";

describe("resolvePlatformFile", () => {
  it("resolves a plain .js module that exists in RN", () => {
    const base = path.join(RN, "Libraries/StyleSheet/StyleSheet");
    expect(resolvePlatformFile(base)).toBe(base + ".js");
  });

  it("returns null when nothing matches", () => {
    expect(resolvePlatformFile(path.join(RN, "Libraries/Does/Not/Exist"))).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/vitest-native && bunx vitest run tests/native-unit.test.ts -t resolvePlatformFile`
Expected: FAIL — `resolve.mjs` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/native/resolve.mjs`:

```js
// Metro-style platform-extension resolution: prefer .ios.js / .native.js over .js,
// and fall back to a directory index. Shared by the require hook and the loader.
import fs from "node:fs";
import path from "node:path";

const EXTS = [".ios.js", ".native.js", ".js"];

/**
 * Given an absolute base path with no extension (e.g. ".../Foo"), return the
 * first existing platform variant (".../Foo.ios.js", etc.) or directory index,
 * or null if none exist.
 */
export function resolvePlatformFile(absBase) {
  for (const ext of EXTS) {
    if (fs.existsSync(absBase + ext)) return absBase + ext;
  }
  for (const ext of EXTS) {
    const idx = path.join(absBase, "index" + ext);
    if (fs.existsSync(idx)) return idx;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/vitest-native && bunx vitest run tests/native-unit.test.ts -t resolvePlatformFile`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/vitest-native/src/native/resolve.mjs packages/vitest-native/tests/native-unit.test.ts
git commit -m "feat(native): platform-extension resolver"
```

---

## Task 5: Globals + require hooks + ESM loader + setup (runtime wiring)

These four `.mjs` files are infrastructure that runs inside Node's module loader; they
are exercised together by the integration test in Task 7 (unit-testing a `module.register`
loader in isolation is not meaningful). Implement them, then prove them via Task 7.

**Files:**
- Create: `src/native/globals.mjs`, `src/native/hooks.mjs`, `src/native/loader.mjs`, `src/native/setup.mjs`

- [ ] **Step 1: Write `src/native/globals.mjs`**

```js
// Globals React Native core expects at runtime, ported from react-native/jest/setup.js.
export function installGlobals() {
  const g = globalThis;
  Object.defineProperties(g, {
    __DEV__: { configurable: true, writable: true, value: true },
    requestAnimationFrame: { configurable: true, writable: true, value: (cb) => setTimeout(() => cb(Date.now()), 0) },
    cancelAnimationFrame: { configurable: true, writable: true, value: (id) => clearTimeout(id) },
    nativeFabricUIManager: { configurable: true, writable: true, value: {} },
    ...(typeof g.window === "undefined" ? { window: { configurable: true, writable: true, value: g } } : {}),
  });
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.IS_REACT_NATIVE_TEST_ENVIRONMENT = true;
  g.__fbBatchedBridgeConfig = { remoteModuleConfig: [], localModulesConfig: [] };
}
```

- [ ] **Step 2: Write `src/native/hooks.mjs`** (intercepts RN's internal `require()` chains)

```js
// Patches Node's CJS loader so RN's internal require() chains are Flow-stripped and
// native-boundary modules are mocked. The companion loader.mjs handles the import() path.
import Module from "node:module";
import path from "node:path";
import fs from "node:fs";
import { transformRN, isFlow } from "./transform.mjs";
import { boundarySourceFor } from "./boundary.mjs";
import { resolvePlatformFile } from "./resolve.mjs";

const RN_PATH = /[\\/](react-native|@react-native)[\\/]/;

let installed = false;
export function installRequireHooks(projectRoot) {
  if (installed) return;
  installed = true;

  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, ...rest) {
    if (parent && parent.filename && RN_PATH.test(parent.filename) && request.startsWith(".") && !path.extname(request)) {
      const hit = resolvePlatformFile(path.resolve(path.dirname(parent.filename), request));
      if (hit) return hit;
    }
    return origResolve.call(this, request, parent, ...rest);
  };

  const origJs = Module._extensions[".js"];
  Module._extensions[".js"] = function (mod, filename) {
    const norm = filename.replace(/\\/g, "/");
    const boundary = boundarySourceFor(norm);
    if (boundary != null) return mod._compile(boundary, filename);
    if (RN_PATH.test(norm)) {
      const src = fs.readFileSync(filename, "utf8");
      if (isFlow(src)) return mod._compile(transformRN(filename, src, projectRoot), filename);
    }
    return origJs(mod, filename);
  };
}
```

- [ ] **Step 3: Write `src/native/loader.mjs`** (intercepts vite-node's externalized `import()`)

```js
// Node ESM loader hook (registered via module.register). Intercepts import() of RN —
// which Module._extensions cannot — Flow-stripping and serving boundary mock source.
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { transformRN, isFlow } from "./transform.mjs";
import { boundarySourceFor } from "./boundary.mjs";
import { resolvePlatformFile } from "./resolve.mjs";

const RN_PATH = /[\\/](react-native|@react-native)[\\/]/;
let PROJECT_ROOT = process.cwd();

export async function initialize(data) {
  if (data && data.projectRoot) PROJECT_ROOT = data.projectRoot;
}

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL && context.parentURL.startsWith("file:") ? fileURLToPath(context.parentURL) : null;
  if (parent && RN_PATH.test(parent) && specifier.startsWith(".") && !path.extname(specifier)) {
    const hit = resolvePlatformFile(path.resolve(path.dirname(parent), specifier));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:")) return nextLoad(url, context);
  const file = fileURLToPath(url);
  const norm = file.replace(/\\/g, "/");
  if (!RN_PATH.test(norm)) return nextLoad(url, context);

  const boundary = boundarySourceFor(norm);
  if (boundary != null) return { format: "commonjs", source: boundary, shortCircuit: true };

  if (norm.endsWith(".js")) {
    const src = fs.readFileSync(file, "utf8");
    if (isFlow(src)) return { format: "commonjs", source: transformRN(file, src, PROJECT_ROOT), shortCircuit: true };
  }
  return nextLoad(url, context);
}
```

- [ ] **Step 4: Write `src/native/setup.mjs`** (the setupFile the plugin injects)

```js
// Native-engine setup file (injected into test.setupFiles by the plugin). Installs
// globals, registers the ESM loader hook, and installs the CJS require hooks.
import { register } from "node:module";
import { installGlobals } from "./globals.mjs";
import { installRequireHooks } from "./hooks.mjs";

const projectRoot = process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd();

installGlobals();
register("./loader.mjs", import.meta.url, { data: { projectRoot } });
installRequireHooks(projectRoot);
```

- [ ] **Step 5: Commit** (no run yet — exercised by Task 7)

```bash
git add packages/vitest-native/src/native/globals.mjs packages/vitest-native/src/native/hooks.mjs packages/vitest-native/src/native/loader.mjs packages/vitest-native/src/native/setup.mjs
git commit -m "feat(native): runtime wiring (globals, require hooks, ESM loader, setup)"
```

---

## Task 6: Plugin wiring — route `engine: 'native'` to the native config

**Files:**
- Create: `src/native/apply.ts`
- Modify: `src/plugin.ts` (resolve engine; branch `config()`; no-op mock hooks under native)
- Test: covered by Task 7 integration test; plus a unit assertion here.

- [ ] **Step 1: Write the failing test**

Add to `tests/native-unit.test.ts`:

```ts
import { reactNative } from "../src/index.js";

describe("plugin engine routing", () => {
  it("native engine sets RN external + a native setup file, and does NOT virtualize react-native", () => {
    const plugin = reactNative({ engine: "native" }) as any;
    const cfg = plugin.config({}, { command: "serve", mode: "test" });
    const ext = cfg.test.server.deps.external.map(String).join(",");
    expect(ext).toMatch(/react-native/);
    expect(cfg.test.setupFiles.some((p: string) => p.includes("native"))).toBe(true);
    // Under native, react-native must NOT be redirected to the mock virtual module.
    expect(plugin.resolveId("react-native", undefined)).toBeUndefined();
  });

  it("mock engine still virtualizes react-native", () => {
    const plugin = reactNative({ engine: "mock" }) as any;
    expect(plugin.resolveId("react-native", undefined)).toBe("\0virtual:react-native");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/vitest-native && bunx vitest run tests/native-unit.test.ts -t "plugin engine routing"`
Expected: FAIL — engine not resolved; `config()` has no native branch.

- [ ] **Step 3: Write `src/native/apply.ts`**

```ts
import path from "node:path";

/**
 * Vite/Vitest config fragment for the native engine. RN is externalized so it
 * loads through Node's single CJS graph, where the native setup file's hooks
 * Flow-strip it and mock the native boundary.
 */
export function nativeEngineConfig(setupFilePath: string, env: Record<string, string>) {
  return {
    resolve: {
      conditions: ["react-native"],
      extensions: [".ios.tsx", ".ios.ts", ".ios.js", ".native.tsx", ".native.ts", ".native.js", ".tsx", ".ts", ".jsx", ".js"],
    },
    test: {
      setupFiles: [setupFilePath],
      env,
      server: {
        deps: {
          external: [/[\\/]react-native[\\/]/, /[\\/]@react-native[\\/]/],
        },
      },
    },
  };
}

/** Resolve the shipped native setup file (dist/native/setup.mjs, or src fallback). */
export function resolveNativeSetup(thisDir: string): string {
  const built = path.resolve(thisDir, "native/setup.mjs");
  const srcFallback = path.resolve(thisDir, "native/setup.mjs");
  return built || srcFallback; // both point at the same colocated layout
}
```

- [ ] **Step 4: Wire the plugin** in `src/plugin.ts`

At the top of `reactNative()` (after the existing `platform`/`diagnostics` consts near `src/plugin.ts:256`), resolve the engine:

```ts
  const requestedEngine = options?.engine ?? "auto";
  const engine: "mock" | "native" = requestedEngine === "native" ? "native" : "mock";
```

Add the native setup path next to the existing `setupFilePath` resolution (`src/plugin.ts:246-253`):

```ts
  const nativeSetupPath = path.resolve(thisDir, "native/setup.mjs");
```

Import the native config helper at the top of `src/plugin.ts`:

```ts
import { nativeEngineConfig } from "./native/apply.js";
```

Replace the body of the `config(userConfig, _env)` hook (`src/plugin.ts:264-302`) so it branches:

```ts
    config(userConfig, _env) {
      const resolvedRoot = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
      const env: Record<string, string> = {
        VITEST_NATIVE_PLATFORM: platform,
        VITEST_NATIVE_DIAGNOSTICS: String(diagnostics),
        VITEST_NATIVE_PROJECT_ROOT: resolvedRoot,
      };

      if (engine === "native") {
        return nativeEngineConfig(nativeSetupPath, env);
      }

      // --- mock engine (existing behaviour) ---
      if (options?.mocks && Object.keys(options.mocks).length > 0) {
        env.VITEST_NATIVE_MOCKS = JSON.stringify(options.mocks);
      }
      if (options?.presets) {
        env.VITEST_NATIVE_PRESET_NAMES = JSON.stringify(options.presets.map((p) => p.name));
      }
      return {
        resolve: { extensions, conditions: ["react-native"] },
        test: { setupFiles: [setupFilePath], env },
      };
    },
```

Guard the mock-only hooks so they no-op under native. At the very start of `resolveId` (`src/plugin.ts:346`), `load` (`src/plugin.ts:406`), and `transform` (`src/plugin.ts:459`), add:

```ts
      if (engine === "native") return undefined;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/vitest-native && bunx vitest run tests/native-unit.test.ts -t "plugin engine routing"`
Expected: PASS (both cases). Also run the full existing suite to confirm no mock-engine regression:
Run: `cd packages/vitest-native && bunx vitest run`
Expected: all existing tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/vitest-native/src/native/apply.ts packages/vitest-native/src/plugin.ts packages/vitest-native/tests/native-unit.test.ts
git commit -m "feat(native): route engine:native through plugin config"
```

---

## Task 7: Ship the native runtime in the build + integration test

**Files:**
- Modify: `tsdown.config.ts`, `package.json`
- Create: `tests-native/vitest.config.mts`, `tests-native/render.test.tsx`

- [ ] **Step 1: Make tsdown copy the native runtime into `dist/native/`**

The `.mjs` runtime files must ship verbatim (they are loaded by Node at runtime, including by `module.register`). Add a copy step. In `tsdown.config.ts`, add a `hooks` block after `external`:

```ts
import { defineConfig } from 'tsdown';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    helpers: 'src/helpers.ts',
    setup: 'src/setup.ts',
    serializer: 'src/serializer.ts',
    presets: 'src/presets/index.ts',
    matchers: 'src/matchers/animated.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['react', 'react-native', 'vitest', 'vite', '@testing-library/react-native', '@testing-library/react-native/build/matchers/extend-expect', '@testing-library/react-native/build/matchers', 'react-test-renderer'],
  hooks: {
    'build:done': () => {
      const srcDir = path.resolve('src/native');
      const outDir = path.resolve('dist/native');
      fs.mkdirSync(outDir, { recursive: true });
      for (const f of fs.readdirSync(srcDir)) {
        if (f.endsWith('.mjs')) fs.copyFileSync(path.join(srcDir, f), path.join(outDir, f));
      }
    },
  },
});
```

(If the installed tsdown version exposes a different hook name, use its post-build hook; the requirement is: copy every `src/native/*.mjs` to `dist/native/*.mjs` after the bundle is written.)

- [ ] **Step 2: Add optional peer deps + ship `dist/native`** in `package.json`

Add to `peerDependencies`:

```json
    "@react-native/babel-preset": "*",
    "@babel/core": "*"
```

Add to `peerDependenciesMeta`:

```json
    "@react-native/babel-preset": { "optional": true },
    "@babel/core": { "optional": true }
```

`files` already lists `dist`, so `dist/native` ships automatically. Add a native test script to `scripts`:

```json
    "test:native": "vitest run --config tests-native/vitest.config.mts"
```

- [ ] **Step 3: Build**

Run: `cd packages/vitest-native && bun run build`
Expected: success; verify `ls dist/native` shows `setup.mjs loader.mjs hooks.mjs transform.mjs boundary.mjs resolve.mjs globals.mjs`.

- [ ] **Step 4: Write the integration test config**

Create `tests-native/vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

export default defineConfig({
  plugins: [reactNative({ engine: "native" })],
  test: {
    globals: true,
    environment: "node",
    include: ["tests-native/*.test.tsx"],
  },
});
```

- [ ] **Step 5: Write the failing integration test**

Create `tests-native/render.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { View, Text, StyleSheet, Platform, Animated, FlatList } from "react-native";

describe("engine:native runs REAL react-native", () => {
  it("renders the authentic RCT host tree with real Text props", () => {
    let tree: any;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(View, null, React.createElement(Text, null, "hello")),
      );
    });
    const json = tree.toJSON();
    expect(json.type).toBe("RCTView");
    expect(json.children[0].type).toBe("RCTText");
    // These props are computed by REAL Text.js, not a hand-written mock:
    expect(json.children[0].props.allowFontScaling).toBe(true);
    expect(JSON.stringify(json)).toContain("hello");
  });

  it("runs real StyleSheet.flatten + Platform", () => {
    const s = StyleSheet.create({ box: { width: 10, height: 20 } });
    expect(StyleSheet.flatten([s.box, { height: 30 }])).toEqual({ width: 10, height: 30 });
    expect(Platform.OS).toBe("ios");
  });

  it("runs real Animated interpolation math", () => {
    const v = new Animated.Value(0);
    const i = v.interpolate({ inputRange: [0, 1], outputRange: [0, 100] });
    v.setValue(0.5);
    expect(i.__getValue()).toBe(50);
  });

  it("renders a real FlatList", () => {
    let tree: any;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(FlatList, {
          data: [{ k: "a" }, { k: "b" }],
          keyExtractor: (it: any) => it.k,
          renderItem: ({ item }: any) => React.createElement(Text, null, item.k),
        }),
      );
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("a");
    expect(json).toContain("b");
  });
});
```

- [ ] **Step 6: Run the integration test**

Run: `cd packages/vitest-native && bun run test:native`
Expected: PASS — 4 tests. (Mirrors the proven spike at `.tmp-spike2/`.) If a module beyond the boundary throws a `getEnforcing`/native error, add its path to `BOUNDARY_SOURCES` in `src/native/boundary.mjs` (Task 3) following the same pattern, rebuild, and re-run.

- [ ] **Step 7: Commit**

```bash
git add packages/vitest-native/tsdown.config.ts packages/vitest-native/package.json packages/vitest-native/tests-native/
git commit -m "feat(native): ship native runtime in build + real-RN integration tests"
```

---

## Task 8: Run RN's own conformance subset under the native engine

**Files:**
- Create: `tests-native/conformance.test.ts`

The `mock` engine ports RN's own tests (`tests/rn-conformance/`). Under `native` those
same assertions run against *real* RN — a strong parity check. Port two pure ones.

- [ ] **Step 1: Write the conformance test** (real RN, real assertions)

Create `tests-native/conformance.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { StyleSheet, Platform } from "react-native";

// Mirrors react-native's own StyleSheet/Platform expectations, run against REAL RN.
describe("native-engine conformance (real RN)", () => {
  it("StyleSheet.flatten merges in order", () => {
    expect(StyleSheet.flatten([{ a: 1 }, { a: 2, b: 3 }])).toEqual({ a: 2, b: 3 });
  });

  it("StyleSheet.create + compose round-trips through flatten", () => {
    const s = StyleSheet.create({ x: { margin: 1 }, y: { padding: 2 } });
    expect(StyleSheet.flatten(StyleSheet.compose(s.x, s.y))).toEqual({ margin: 1, padding: 2 });
  });

  it("Platform.select returns the ios branch", () => {
    expect(Platform.select({ ios: "i", android: "a", default: "d" })).toBe("i");
  });

  it("Platform.constants exposes a reactNativeVersion", () => {
    expect(typeof Platform.constants.reactNativeVersion.minor).toBe("number");
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd packages/vitest-native && bun run test:native`
Expected: PASS — render + conformance tests all green.

- [ ] **Step 3: Commit**

```bash
git add packages/vitest-native/tests-native/conformance.test.ts
git commit -m "test(native): run real-RN conformance subset under native engine"
```

---

## Task 9: Wire native tests into CI + document the option

**Files:**
- Modify: `package.json` (root), `packages/vitest-native/README.md`
- Modify: the CI workflow that runs tests (e.g. `.github/workflows/*.yml`) — add the native suite.

- [ ] **Step 1: Add a root script** in the repo-root `package.json` `scripts`:

```json
    "test:native": "bun run --filter vitest-native test:native"
```

- [ ] **Step 2: Add the native suite to CI.** In the workflow step that runs `bun run test`, add a following step:

```yaml
      - name: Native engine tests
        run: bun run build && bun run test:native
        working-directory: packages/vitest-native
```

(Match the existing job's shell/setup; the requirement is that `test:native` runs after a build in CI.)

- [ ] **Step 3: Document the engine option** in `packages/vitest-native/README.md` under "Plugin Options", after the existing options table:

```md
### `engine`

Choose how React Native is provided to your tests:

- `'mock'` *(default today)* — a fast, pure-JS reimplementation of React Native.
  Best for unit/logic tests.
- `'native'` — runs the **real** React Native JS, mocking only the native boundary,
  for Jest-level fidelity. Requires `@react-native/babel-preset` and `@babel/core`
  in your project (present by default in React Native apps).
- `'auto'` — picks automatically. Currently resolves to `'mock'`.

```ts
reactNative({ engine: 'native' })
```
```

- [ ] **Step 4: Run the full suite (both engines) to confirm green**

Run: `cd packages/vitest-native && bun run build && bun run test && bun run test:native`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json packages/vitest-native/README.md .github/workflows/
git commit -m "ci+docs(native): run native suite in CI and document engine option"
```

---

## Self-Review (completed)

- **Spec coverage:** §3 engine API → Task 1, 6. §4.1 single graph (externalize) → Task 6 (`apply.ts`), 7. §4.2 two hooks / loader+_extensions → Task 5. §4.2 disk-cached babel / component syntax → Task 2. §4.2 platform resolution → Task 4. §4.3 boundary set → Task 3. §4.5 renderer (react-test-renderer transitional) → Task 7. Phase 0 "port spike tests + conformance under native" → Task 7, 8. `mock` unchanged + default → Task 6 (engine resolves non-native → mock) + Task 6 regression run. Shared-runtime/`isolate:false`, Meta-mock reuse, `auto`/per-glob → explicitly deferred (header). **No uncovered Phase-0 spec items.**
- **Placeholder scan:** none — every code/test step contains complete content; the only conditional is Task 7 Step 6's "add boundary module if one throws," which gives an exact procedure and file.
- **Type consistency:** `transformRN(file, src, projectRoot)` / `isFlow(src)` defined Task 2, used Tasks 5–6. `boundarySourceFor(normPath)` / `isBoundary(normPath)` defined Task 3, used Task 5. `resolvePlatformFile(absBase)` defined Task 4, used Task 5. `installGlobals()`, `installRequireHooks(projectRoot)`, loader `initialize/resolve/load` defined Task 5, used by `setup.mjs`. `nativeEngineConfig(setupFilePath, env)` defined Task 6, used in `plugin.ts`. `engine` option defined Task 1, consumed Task 6. Consistent throughout.
