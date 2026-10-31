/**
 * What a project module Node `require`s gets when the test imported it, without
 * jest-compat (see import-then-require.test.ts). Each case is one property of the
 * facade or the load hook that hands it out (`viteInstanceOf` in node-registry.mjs).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import hello, { named } from "./fixtures/def";
import { callAssigned, callSpied } from "./fixtures/consumer";
import { boom } from "./fixtures/errors";
import { bSaw, state as cycState } from "./fixtures/cyc-a";
import { state as isolatedState } from "./fixtures/isolated";

const registry = () =>
  (globalThis as Record<string, any>).__vitest_native_jest_registry as {
    baseline: Set<string>;
    stats: { resolves: number; toNode: number };
    isolate(name: string, other: string): () => void;
  };

afterEach(() => vi.restoreAllMocks());

describe("a project module required after the test imported it", () => {
  it("keeps its default export readable through Babel's interop", () => {
    void hello;
    const read = (require("./fixtures/def-reader.cjs") as () => Record<string, unknown>)();
    expect(read).toEqual({ esModule: true, named, call: "hi" });
  });

  it("takes vi.spyOn, and the spy reaches Vite importers", () => {
    vi.spyOn(require("./fixtures/api") as { fetchUser(): string }, "fetchUser").mockReturnValue(
      "spied",
    );
    expect(callSpied()).toBe("spied");
  });

  it("takes an assignment to an export, which reaches Vite importers", () => {
    (require("./fixtures/api-assign") as { fetchUser(): string }).fetchUser = () => "assigned";
    expect(callAssigned()).toBe("assigned");
  });

  it("keeps instanceof across the bridge", () => {
    expect((require("./fixtures/catcher.cjs") as (fn: () => void) => boolean)(boom)).toBe(true);
  });
});

describe("what the load hook leaves to Node", () => {
  it("a module Node already holds stays the one require returns", async () => {
    const first = require("./fixtures/held") as { state: object };
    await import("./fixtures/held");
    expect(require("./fixtures/held")).toBe(first);
  });

  it("a file Vite is still evaluating is not shared: the cycle gets Node's own copy", () => {
    // cyc-b.cjs requires cyc-a while the test's import of it is mid-evaluation.
    expect(bSaw().state).not.toBe(cycState);
  });

  it("inside an isolation block, require is not handed a module Vite evaluated in it", async () => {
    // Today's behaviour, pinned: the block's Vite and Node instances stay apart (Jest's
    // isolated registry would give one). The hook skips sharing while a block is open,
    // so the block's restore only has Node's own modules to put back.
    const end = registry().isolate("isolateModules", "isolateModulesAsync");
    try {
      const imported = await import("./fixtures/isolated-late");
      expect((require("./fixtures/isolated-late") as { state: object }).state).not.toBe(
        imported.state,
      );
    } finally {
      end();
    }
  });

  it("inside an isolation block, require loads a fresh module", () => {
    const end = registry().isolate("isolateModules", "isolateModulesAsync");
    try {
      expect((require("./fixtures/isolated") as { state: object }).state).not.toBe(isolatedState);
    } finally {
      end();
    }
  });
});

it("the registry's resident set is taken after the setup's own loads", () => {
  // The native setup requires RNTL's matchers (whichever path this RNTL major ships them
  // at) before it installs the sharing; a reset must leave them, so they are in the baseline.
  const candidates = [
    "@testing-library/react-native/matchers",
    "@testing-library/react-native/build/matchers",
    "@testing-library/react-native/dist/matchers",
  ];
  const loaded = candidates.flatMap((id) => {
    try {
      return [require.resolve(id)];
    } catch {
      return [];
    }
  });
  expect(loaded.length).toBeGreaterThan(0);
  const baseline = registry().baseline;
  expect(loaded.some((file) => baseline.has(file))).toBe(true);
});

it("an installed package required by its bare name goes to Node without being resolved", () => {
  const read = require("./fixtures/requires-installed.cjs") as () => unknown;
  const { stats } = registry();
  const before = { ...stats };
  read();
  expect(stats.toNode).toBe(before.toNode + 1);
  expect(stats.resolves).toBe(before.resolves);
});

it("the baseline is fixed once per worker: installing the sharing again leaves it", async () => {
  require("./fixtures/late-loaded.cjs");
  const late = require.resolve("./fixtures/late-loaded.cjs");
  const { shareProjectModules } = await import("../../dist/jest-compat/node-registry.mjs");
  shareProjectModules();
  expect(registry().baseline.has(late)).toBe(false);
});
