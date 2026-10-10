/**
 * Every preset mock, and every mock in the mock engine's `react-native`, keeps its
 * behaviour through a mock reset.
 *
 * `vi.resetAllMocks()`, and `mockReset: true`, which runs it before every test, put
 * each mock back to the implementation passed to `vi.fn(impl)`. One installed later,
 * with `.mockReturnValue()`, `.mockReturnThis()`, `.mockImplementation()` or the
 * promise variants, is dropped, and the mock returns undefined from then on. A preset
 * built that way works until the first reset: reanimated's
 * `LinearTransition.springify().damping(20)` threw (issue #278), and so did a
 * gesture-handler gesture built at module scope, e.g. `Gesture.Pan().onStart(...)`.
 *
 * This walks the module object of every preset, including the objects its mocks
 * return (a builder created by `Gesture.Pan()`), and requires each mock to have the
 * same implementation after a reset as before it. The presets come from the barrel,
 * so a new preset is covered without being listed here. The mock engine's
 * `react-native` is walked the same way.
 *
 * A walk only sees the mocks as they are built. An implementation installed later
 * (`setPlatform()` once called `Platform.select.mockImplementation()`, which a reset
 * dropped, so `Platform.OS` said "android" while `select()` picked the iOS value) is
 * caught by the source scan at the end: nothing the package ships may install one.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildReactNativeMock } from "../src/mocks/registry.js";
import * as presets from "../src/presets/index.js";
import type { Preset } from "../src/types.js";

type Mock = ReturnType<typeof vi.fn>;

/** Depth bound for the walk: deep enough for builders returned by builders. */
const MAX_DEPTH = 6;

/** Every mock reachable from `root`, keyed by the path that reached it first. */
function mocksIn(root: unknown): Map<Mock, string> {
  const found = new Map<Mock, string>();
  const seen = new Set<unknown>();

  function visit(value: unknown, at: string, depth: number) {
    if (depth > MAX_DEPTH || value === null) return;
    if (typeof value !== "object" && typeof value !== "function") return;
    if (seen.has(value)) return;
    seen.add(value);

    if (vi.isMockFunction(value)) {
      found.set(value, at);
      // A mock may build something that holds more mocks, as a gesture or a
      // layout-animation builder does: `Gesture.Pan()` is how a test file creates
      // one at module scope. Only an implementation that takes no parameters is
      // called. One that does (Image.getSize(uri, success)) can act on what it is
      // given later, and a stray callback or rejection would surface as an unhandled
      // error in whatever test runs next.
      if (value.getMockImplementation()?.length === 0) {
        let result: unknown;
        try {
          result = value();
        } catch {
          result = undefined;
        }
        if (typeof (result as PromiseLike<unknown> | undefined)?.then === "function") {
          Promise.resolve(result).catch(() => {});
        } else {
          visit(result, `${at}()`, depth + 1);
        }
      }
    }

    for (const key of Object.keys(value)) {
      let child: unknown;
      try {
        child = (value as Record<string, unknown>)[key];
      } catch {
        continue;
      }
      visit(child, `${at}.${key}`, depth + 1);
    }
  }

  visit(root, "", 0);
  return found;
}

/** Paths, under `label`, of the mocks in `root` whose implementation a reset drops. */
function droppedByReset(root: unknown, label: string): string[] {
  const mocks = mocksIn(root);
  const before = new Map([...mocks.keys()].map((m) => [m, m.getMockImplementation()]));
  vi.resetAllMocks();
  return [...mocks]
    .filter(([m]) => m.getMockImplementation() !== before.get(m))
    .map(([, at]) => `${label}${at}`);
}

const all = Object.entries(presets) as [string, () => Preset][];

describe("preset mocks after vi.resetAllMocks()", () => {
  it("covers every preset in the barrel", () => {
    expect(all.length).toBeGreaterThan(0);
  });

  for (const [presetName, create] of all) {
    for (const [moduleName, mod] of Object.entries(create().modules)) {
      it(`${presetName}: ${moduleName} keeps every mock's implementation`, () => {
        expect(droppedByReset(mod.factory(), moduleName), "dropped by a reset").toEqual([]);
      });
    }
  }
});

describe("mock engine react-native after vi.resetAllMocks()", () => {
  for (const platform of ["ios", "android"] as const) {
    it(`${platform}: keeps every mock's implementation`, () => {
      const rn = buildReactNativeMock(platform);
      expect(droppedByReset(rn, "react-native"), "dropped by a reset").toEqual([]);
    });
  }
});

describe("package source", () => {
  // jest-compat implements Jest's own mock API on top of Vitest's, so it is the one
  // place these setters belong.
  const SRC = path.resolve(import.meta.dirname, "../src");
  const EXEMPT = path.join(SRC, "jest-compat");
  const SETTER =
    /\.mock(?:ReturnValue|ReturnThis|Implementation|ResolvedValue|RejectedValue)(?:Once)?\(/;

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return full === EXEMPT ? [] : sourceFiles(full);
      return /\.(?:[cm]?[jt]s|tsx)$/.test(entry.name) ? [full] : [];
    });
  }

  it("never installs a mock implementation a reset would drop", () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(0);
    const offending = files.flatMap((file) =>
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, at: `${path.relative(SRC, file)}:${i + 1}` }))
        .filter(({ line }) => SETTER.test(line) && !/^\s*(?:\/\/|\*)/.test(line))
        .map(({ at }) => at),
    );
    expect(offending, "use vi.fn(impl), which a reset keeps").toEqual([]);
  });
});
