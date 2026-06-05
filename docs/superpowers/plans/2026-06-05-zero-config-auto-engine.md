# Zero-Config `auto` Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the `engine` option at Vite `config()` time via capability detection so `auto` keeps resolving to `mock` (non-breaking) but loudly *nudges* toward `native` when the project can run it — with the future v1 flip to native-preferred reduced to a one-line, test-locked change.

**Architecture:** A new pure module `src/native/detect.ts` exports `detectEngine(requested, projectRoot)` returning `{ engine, nativeAvailable, notice }`. The plugin moves engine resolution from construction time into the `config()` hook (first hook that knows the project root), stores the decision in a closure `let`, prints `notice` once, and reuses the decision in `configResolved`. Existing `resolveId`/`load`/`transform` hooks read the same closure variable.

**Tech Stack:** TypeScript, Vite/Vitest plugin API, Node `module.createRequire`, Vitest, changesets.

**Reference:** `docs/superpowers/specs/2026-06-05-zero-config-auto-engine-design.md`.

---

## File Structure

All paths under `packages/vitest-native/`.

- Create `src/native/detect.ts` — pure engine-resolution policy (`detectEngine`, `AUTO_PREFERS_NATIVE`). No RN import; unit-testable.
- Create `tests/detect.test.ts` — unit tests for `detectEngine`.
- Modify `src/plugin.ts` — resolve engine in `config()` via `detectEngine`; `let engine`; print notice; reuse in `configResolved`.
- Modify `tests/native-unit.test.ts` — update/extend the "plugin engine routing" block + a nudge test.
- Modify `src/types.ts` — doc-only update of the `engine` `'auto'` JSDoc line.
- Modify `vitest.config.ts` — pin to `engine: 'mock'` (future-proof + silence the nudge in our own run).
- Modify `README.md` — document `auto`'s current behavior + that native is recommended/becomes default in v1.
- Create `.changeset/zero-config-auto-nudge.md` — minor release note.

---

## Task 1: `detectEngine` — pure engine-resolution policy

**Files:**
- Create: `packages/vitest-native/src/native/detect.ts`
- Test: `packages/vitest-native/tests/detect.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/vitest-native/tests/detect.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { detectEngine } from "../src/native/detect.js";

// Anchor the "deps present" root to the package dir (where @react-native/babel-preset
// and @babel/core resolve), cwd-independent.
const HERE = path.dirname(fileURLToPath(import.meta.url));
function findUp(rel: string, start: string): string {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, rel))) return path.join(dir, rel);
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`${rel} not found from ${start}`);
    dir = parent;
  }
}
const PKG_DIR = path.dirname(findUp("package.json", HERE));

// A fresh temp dir with an empty package.json: a root where the native deps do NOT resolve.
function depsFreeRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-detect-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", version: "0.0.0" }));
  return dir;
}

describe("detectEngine", () => {
  it("passes through explicit engines without a notice", () => {
    expect(detectEngine("native", PKG_DIR).engine).toBe("native");
    expect(detectEngine("native", PKG_DIR).notice).toBeNull();
    expect(detectEngine("mock", PKG_DIR).engine).toBe("mock");
    expect(detectEngine("mock", PKG_DIR).notice).toBeNull();
  });

  it("auto resolves to mock today but nudges when native is available", () => {
    const d = detectEngine("auto", PKG_DIR);
    expect(d.engine).toBe("mock");
    expect(d.nativeAvailable).toBe(true);
    expect(d.notice).toContain("native engine available");
  });

  it("auto resolves to native under the future v1 policy (one-line flip is locked)", () => {
    const d = detectEngine("auto", PKG_DIR, { autoPrefersNative: true });
    expect(d.engine).toBe("native");
    expect(d.notice).toContain("native");
  });

  it("auto resolves to mock with no notice when native deps are absent", () => {
    const d = detectEngine("auto", depsFreeRoot());
    expect(d.engine).toBe("mock");
    expect(d.nativeAvailable).toBe(false);
    expect(d.notice).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/vitest-native && bunx vitest run tests/detect.test.ts`
Expected: FAIL — `../src/native/detect.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `packages/vitest-native/src/native/detect.ts`:

```ts
import { createRequire } from "node:module";
import path from "node:path";

export type RequestedEngine = "auto" | "mock" | "native";
export type ResolvedEngine = "mock" | "native";

/**
 * Whether `auto` prefers native when the project supports it.
 * v0.x: false — `auto` resolves to mock (non-breaking) and nudges toward native.
 * v1.0: flip to true to make native the zero-config default (major release).
 */
export const AUTO_PREFERS_NATIVE = false;

export interface EngineDecision {
  engine: ResolvedEngine;
  /** True when @react-native/babel-preset + @babel/core resolve from projectRoot. */
  nativeAvailable: boolean;
  /** One concise line to print once, or null for silence. */
  notice: string | null;
}

/** Can this project run the native engine? (Both transform deps resolvable.) */
function isNativeCapable(projectRoot: string): boolean {
  try {
    const req = createRequire(path.join(projectRoot, "package.json"));
    req.resolve("@react-native/babel-preset");
    req.resolve("@babel/core");
    return true;
  } catch {
    return false;
  }
}

/** Resolve the concrete engine for a run. Pure; never throws. */
export function detectEngine(
  requested: RequestedEngine,
  projectRoot: string,
  opts?: { autoPrefersNative?: boolean },
): EngineDecision {
  const nativeAvailable = isNativeCapable(projectRoot);

  if (requested === "native") return { engine: "native", nativeAvailable, notice: null };
  if (requested === "mock") return { engine: "mock", nativeAvailable, notice: null };

  // requested === "auto"
  const prefersNative = opts?.autoPrefersNative ?? AUTO_PREFERS_NATIVE;
  if (prefersNative && nativeAvailable) {
    return {
      engine: "native",
      nativeAvailable,
      notice: "[vitest-native] engine: native (auto — found @react-native/babel-preset)",
    };
  }
  if (nativeAvailable) {
    return {
      engine: "mock",
      nativeAvailable,
      notice:
        "[vitest-native] native engine available — set engine:'native' for real-RN fidelity (becomes the default in v1)",
    };
  }
  return { engine: "mock", nativeAvailable: false, notice: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/vitest-native && bunx vitest run tests/detect.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/vitest-native/src/native/detect.ts packages/vitest-native/tests/detect.test.ts
git commit -m "feat(native): detectEngine — capability-based engine resolution policy"
```

---

## Task 2: Wire `detectEngine` into the plugin (config-time resolution + nudge)

**Files:**
- Modify: `packages/vitest-native/src/plugin.ts` (import; `let engine` at ~266; detect in `config()` at ~283; reuse in `configResolved` at ~350)
- Test: `packages/vitest-native/tests/native-unit.test.ts` (replace the "plugin engine routing" block; add a nudge test)

- [ ] **Step 1: Write the failing tests**

In `packages/vitest-native/tests/native-unit.test.ts`, replace the entire existing `describe("plugin engine routing", ...)` block with:

```ts
import { reactNative } from "../src/index.js";

const SERVE_ENV = { command: "serve", mode: "test" } as const;

describe("plugin engine routing", () => {
  it("auto (default) resolves to mock today, even when native is available", () => {
    const plugin = reactNative({}) as any;
    const cfg = plugin.config({ root: projectRoot }, SERVE_ENV);
    // mock config: no RN externalization, react-native is virtualized.
    expect(cfg.test.server?.deps?.external).toBeUndefined();
    expect(plugin.resolveId("react-native", undefined)).toBe("\0virtual:react-native");
  });

  it("explicit native sets RN external + a native setup file, and does NOT virtualize react-native", () => {
    const plugin = reactNative({ engine: "native" }) as any;
    const cfg = plugin.config({ root: projectRoot }, SERVE_ENV);
    const ext = cfg.test.server.deps.external.map(String).join(",");
    expect(ext).toMatch(/react-native/);
    expect(cfg.test.setupFiles.some((p: string) => p.includes("native"))).toBe(true);
    expect(plugin.resolveId("react-native", undefined)).toBeUndefined();
  });

  it("explicit mock virtualizes react-native", () => {
    const plugin = reactNative({ engine: "mock" }) as any;
    plugin.config({ root: projectRoot }, SERVE_ENV);
    expect(plugin.resolveId("react-native", undefined)).toBe("\0virtual:react-native");
  });
});

describe("native nudge", () => {
  it("auto prints the native nudge once when the project is native-capable", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const plugin = reactNative({}) as any;
    plugin.config({ root: projectRoot }, SERVE_ENV);
    const nudges = log.mock.calls.filter((c) => String(c[0]).includes("native engine available"));
    expect(nudges).toHaveLength(1);
    log.mockRestore();
  });

  it("auto prints no nudge when native deps are absent", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vn-nudge-"));
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "x", version: "0.0.0" }));
    const plugin = reactNative({}) as any;
    plugin.config({ root: tmp }, SERVE_ENV);
    const nudges = log.mock.calls.filter((c) => String(c[0]).includes("native engine available"));
    expect(nudges).toHaveLength(0);
    log.mockRestore();
  });
});
```

At the top of `tests/native-unit.test.ts`, ensure `vi` and `os` are imported. The file already imports `path`, `fs`, and (from earlier) defines `projectRoot`. Update the first import line and add the `os` import:

```ts
import { describe, it, expect, vi } from "vitest";
import os from "node:os";
```

(The existing `import { describe, it, expect } from "vitest";` becomes the line above; add `os`. `path`, `fs`, `fileURLToPath`, and the `projectRoot` const already exist in this file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/vitest-native && bunx vitest run tests/native-unit.test.ts -t "plugin engine routing"`
Expected: FAIL — `reactNative({})` currently resolves `auto` to mock at construction but does not run `detectEngine`; the "auto resolves to mock" test may pass by luck, but the nudge tests FAIL (no nudge printed) and the routing block referencing `cfg.test.server?.deps?.external` for the mock branch needs the new behavior. Confirm the `native nudge` tests fail.

- [ ] **Step 3: Import `detectEngine` in the plugin**

In `packages/vitest-native/src/plugin.ts`, add after the existing `import { nativeEngineConfig } from "./native/apply.js";` line:

```ts
import { detectEngine } from "./native/detect.js";
```

- [ ] **Step 4: Make `engine` a config-time `let`**

In `packages/vitest-native/src/plugin.ts`, replace these two lines (around line 266):

```ts
  const requestedEngine = options?.engine ?? "auto";
  const engine: "mock" | "native" = requestedEngine === "native" ? "native" : "mock";
```

with:

```ts
  const requestedEngine = options?.engine ?? "auto";
  // Resolved at config() time, once the consumer project root is known. Seeded to a
  // safe default so the hooks (resolveId/load/transform), which run after config(),
  // never read undefined.
  let engine: "mock" | "native" = requestedEngine === "native" ? "native" : "mock";
```

- [ ] **Step 5: Resolve the engine inside `config()` and print the notice**

In `packages/vitest-native/src/plugin.ts`, find this line inside the `config(userConfig, _env)` hook (around line 283):

```ts
      const resolvedRoot = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
```

Immediately after it, insert:

```ts
      // Resolve the concrete engine now that the project root is known, and surface
      // the choice (auto -> native nudge today; auto-selection announcement post-v1).
      const decision = detectEngine(requestedEngine, resolvedRoot);
      engine = decision.engine;
      if (decision.notice) console.log(decision.notice);
```

- [ ] **Step 6: Make `ResolvedOptions.engine` reflect the decision**

In `packages/vitest-native/src/plugin.ts`, find this line inside `configResolved` (around line 350):

```ts
      resolved = await resolveOptions(options, config.root);
```

Immediately after it, insert:

```ts
      // The authoritative engine is the one decided in config(); keep ResolvedOptions in sync.
      resolved.engine = engine;
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd packages/vitest-native && bunx vitest run tests/native-unit.test.ts -t "plugin engine routing"`
Expected: PASS.
Run: `cd packages/vitest-native && bunx vitest run tests/native-unit.test.ts -t "native nudge"`
Expected: PASS (both).

- [ ] **Step 8: Run the full unit file + typecheck**

Run: `cd packages/vitest-native && bunx vitest run tests/native-unit.test.ts tests/detect.test.ts`
Expected: PASS.
Run: `cd packages/vitest-native && bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add packages/vitest-native/src/plugin.ts packages/vitest-native/tests/native-unit.test.ts
git commit -m "feat(native): resolve engine at config() time + native nudge for auto"
```

---

## Task 3: Pin repo config, docs, changeset, and full regression

**Files:**
- Modify: `packages/vitest-native/vitest.config.ts`
- Modify: `packages/vitest-native/src/types.ts` (doc-only)
- Modify: `packages/vitest-native/README.md`
- Create: `.changeset/zero-config-auto-nudge.md` (repo root)

- [ ] **Step 1: Pin the repo's own config to mock**

In `packages/vitest-native/vitest.config.ts`, change:

```ts
  plugins: [reactNative({ diagnostics: true })],
```

to:

```ts
  // Pinned to mock: this suite asserts mock-engine behavior. Pinning keeps it stable
  // across the future v1 auto->native flip and silences the native nudge in our own run.
  plugins: [reactNative({ engine: "mock", diagnostics: true })],
```

- [ ] **Step 2: Update the `engine` JSDoc in types**

In `packages/vitest-native/src/types.ts`, replace the `'auto'` line inside the `engine?` JSDoc:

```ts
   * - 'auto'   — picks an engine automatically. Currently resolves to 'mock'.
```

with:

```ts
   * - 'auto'   — picks automatically. Currently resolves to 'mock'; when
   *              '@react-native/babel-preset' is present it recommends 'native'
   *              (becomes the default in v1).
```

- [ ] **Step 3: Document `auto` in the README**

In `packages/vitest-native/README.md`, replace the `### \`engine\`` section body (the bullet list describing `'mock'`/`'native'`/`'auto'`) with:

```md
### `engine`

Choose how React Native is provided to your tests:

- `'native'` — runs the **real** React Native JS, mocking only the native boundary, for
  Jest-level fidelity. Best for components, integration, RNTL, virtualized lists, and
  anything where a false pass is costly. Requires `@react-native/babel-preset` and
  `@babel/core` in your project (present by default in React Native apps).
- `'mock'` — a fast, pure-JS reimplementation of React Native with **zero extra
  dependencies**. Best for pure-logic/unit tests, maximum determinism, or when you can't
  add the babel deps.
- `'auto'` *(default)* — picks automatically. **Today it resolves to `'mock'`**; when
  `@react-native/babel-preset` is detected it prints a one-line hint recommending
  `engine: 'native'`. **In v1, `'auto'` will default to `'native'` when available** — set
  `engine: 'mock'` to keep the current behavior.

```ts
reactNative({ engine: 'native' })
```
```

(If the existing README `engine` section differs in wording, replace its bullet list and example with the block above; keep the surrounding `### engine` heading and options-table row intact.)

- [ ] **Step 4: Add a changeset**

Create `.changeset/zero-config-auto-nudge.md` (at the repo root):

```md
---
"vitest-native": minor
---

Add capability-based engine detection and a native-engine nudge. `engine: 'auto'` (the
default) still resolves to `mock` this release — **no behavior change for existing
projects** — but when `@react-native/babel-preset` is installed it now prints a one-line
hint recommending `engine: 'native'` for real-RN fidelity. Explicit `engine: 'native'` and
`engine: 'mock'` are unchanged. `auto` will default to `native` (when available) in v1.
```

- [ ] **Step 5: Build + run both engine suites + lint + typecheck + format**

Run: `cd packages/vitest-native && bun run build`
Expected: success.
Run: `cd packages/vitest-native && bun run test`
Expected: PASS — **1164** passed / 18 skipped (mock suite, now pinned).
Run: `cd packages/vitest-native && bun run test:native`
Expected: PASS — **39** passed.
Run: `cd /Users/danielfry/dev/vitest-react-native && bun run lint && bun run typecheck && bun run format:check`
Expected: all pass (run `bun run format` first if `format:check` reports issues, then re-check).

- [ ] **Step 6: Verify the example app still resolves to mock (fallback path)**

Run: `cd /Users/danielfry/dev/vitest-react-native && bun run test:example`
Expected: PASS — the example app has no `@react-native/babel-preset`, so `auto` → mock with no nudge; its suite stays green.

- [ ] **Step 7: Commit**

```bash
git add packages/vitest-native/vitest.config.ts packages/vitest-native/src/types.ts packages/vitest-native/README.md .changeset/zero-config-auto-nudge.md
git commit -m "feat(native): pin repo to mock, document auto behavior, add changeset"
```

---

## Self-Review (completed)

- **Spec coverage:** §3 detection rule + policy → Task 1 (`detectEngine`, `AUTO_PREFERS_NATIVE`, capability check). §3 resolution table (explicit pass-through; auto→mock+nudge; auto→native under v1 policy; not-capable→mock silent) → Task 1 tests + impl. §4 config-time resolution / data flow → Task 2 (steps 4–6). §5 `detect.ts` interface → Task 1. §5 `plugin.ts` changes → Task 2. §5 `types.ts` doc → Task 3 step 2. §5 repo pin (+ example no-change) → Task 3 steps 1, 6. §5 README + changeset → Task 3 steps 3–4. §6 edge cases (auto never throws; explicit native unchanged; one nudge/run) → Task 1 not-capable case + Task 2 nudge tests. §7 tests (detect units w/ explicit roots incl. v1-policy lock + temp dir; routing; nudge; regression) → Tasks 1–3. §9 success criteria → Tasks 1–3 + step 5/6 regression. **No uncovered spec items.**
- **Placeholder scan:** none — every code/test step contains complete content. Task 3 step 3's parenthetical ("if the existing README wording differs") gives an exact replacement block, not a placeholder.
- **Type consistency:** `detectEngine(requested, projectRoot, opts?)` returning `{ engine, nativeAvailable, notice }` defined Task 1, consumed Task 2 (`decision.engine`, `decision.notice`). `AUTO_PREFERS_NATIVE` defined Task 1, referenced in the spec/JSDoc. `let engine: "mock" | "native"` (Task 2 step 4) read by `config()` branch + `resolveId`/`load`/`transform` (unchanged) + written to `resolved.engine` (Task 2 step 6). `requestedEngine` (existing) passed to `detectEngine`. Consistent throughout.
