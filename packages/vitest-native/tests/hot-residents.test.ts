/**
 * The resident-state audit (test:native:hot:residents) holds a hot worker's carried state
 * to its declarations, tests-native/hot-residents.json. These keep the declarations in
 * step with the source, the probe files and the docs, and pin the comparison itself.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RUNTIME_RESIDENT_PACKAGES,
  TEST_RUNTIME_RESIDENT_PACKAGES,
} from "../src/native/ownership.mjs";
import { RESIDENT_GLOBALS } from "../src/native/resident-globals.mjs";
import { HOT_STATE_MANIFEST_ENTRIES } from "../src/native/state-manifest.mjs";
import { DECLARATIONS, audit, packageOf, refusal } from "../scripts/test-hot-residents.mjs";

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(PACKAGE, "../..");
const PROBES = path.join(PACKAGE, "tests-native", "hot-residents");

type Declared = {
  probes: Record<string, { resident: string; group: string }>;
  carryOver: Record<
    string,
    { hot: unknown; fresh: unknown; doc?: string; exhibit?: string; issue?: number }
  >;
  unprobed: { resident: string; doc?: string; reason: string; coveredBy?: string }[];
  inventory: { globals: string[]; console: string[] };
};
const declared: Declared = JSON.parse(fs.readFileSync(DECLARATIONS, "utf8"));

const sourceFiles = (dir: string): string[] =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(mjs|ts)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));

/** Every state-manifest entry and resident health check the source registers. */
function registeredIds() {
  const ids = new Set<string>(HOT_STATE_MANIFEST_ENTRIES);
  for (const file of sourceFiles(path.join(PACKAGE, "src"))) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(
      /(?:register|registerState|__vitest_native_register_state\?\.)\(\{\s*id: "([^"]+)"/g,
    )) {
      ids.add(match[1]);
    }
    if (file.endsWith("resident-health.mjs")) {
      for (const match of text.matchAll(/^\s+id: "([^"]+)",/gm)) ids.add(match[1]);
    }
  }
  return ids;
}

const covered = () =>
  new Set([
    ...Object.values(declared.probes).map((probe) => probe.resident),
    ...declared.unprobed.map((entry) => entry.resident),
  ]);

function knownDifferences() {
  const doc = fs.readFileSync(path.join(REPO, "website/guide/hot-runtime.md"), "utf8");
  const section = doc.split("## Known differences")[1].split("\n## ")[0];
  return section.split("\n").filter((line) => line.startsWith("- "));
}

describe("the audit's declarations", () => {
  it("cover every state-manifest entry and resident health check in the source", () => {
    const ids = registeredIds();
    expect(ids.size).toBeGreaterThan(14);
    expect([...ids].filter((id) => !covered().has(id))).toEqual([]);
  });

  it("cover every resident package", () => {
    const packages = [...RUNTIME_RESIDENT_PACKAGES, ...TEST_RUNTIME_RESIDENT_PACKAGES];
    expect(packages.filter((name) => !covered().has(name))).toEqual([]);
  });

  it("name a probe pair that exists for every probe, and nothing else observes", () => {
    const files = fs
      .readdirSync(PROBES, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.test\.tsx?$/.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name));
    const observedBy = new Map<string, string[]>();
    for (const file of files) {
      for (const match of fs.readFileSync(file, "utf8").matchAll(/observe\("([^"]+)"/g)) {
        observedBy.set(match[1], [...(observedBy.get(match[1]) ?? []), file]);
      }
    }
    for (const [probe, { group }] of Object.entries(declared.probes)) {
      const observers = observedBy.get(probe) ?? [];
      expect(observers, `probe ${probe}`).toHaveLength(1);
      expect(path.relative(PROBES, path.dirname(observers[0]))).toBe(group);
      const pair = fs.readdirSync(path.dirname(observers[0]));
      const second = path.basename(observers[0]);
      expect(pair, `probe ${probe} has a first file`).toContain(second.replace(/2(\.test)/, "1$1"));
    }
    expect([...observedBy.keys()].filter((probe) => !(probe in declared.probes))).toEqual([]);
  });

  it("document each carry-over: a Known differences bullet and its exhibit, or an issue", () => {
    const bullets = knownDifferences();
    const exhibits = new Set(
      (
        JSON.parse(
          fs.readFileSync(path.join(PACKAGE, "validation/bug-museum/exhibits.json"), "utf8"),
        ).exhibits as { id: string }[]
      ).map((exhibit) => exhibit.id),
    );
    for (const [probe, entry] of Object.entries(declared.carryOver)) {
      expect(declared.probes, `carry-over ${probe}`).toHaveProperty(probe);
      if (entry.issue !== undefined) {
        expect(entry.doc, `carry-over ${probe} is tracked by an issue`).toBeUndefined();
        continue;
      }
      expect(
        bullets.filter((bullet) => bullet.includes(entry.doc!)),
        probe,
      ).toHaveLength(1);
      expect(exhibits.has(entry.exhibit!), `exhibit ${entry.exhibit}`).toBe(true);
    }
  });

  it("account for every Known differences bullet exactly once", () => {
    const docs = [
      ...Object.values(declared.carryOver).map((entry) => entry.doc),
      ...declared.unprobed.map((entry) => entry.doc),
    ].filter((doc): doc is string => doc !== undefined);
    for (const bullet of knownDifferences()) {
      expect(
        docs.filter((doc) => bullet.includes(doc)),
        bullet,
      ).toHaveLength(1);
    }
  });
});

describe("the audit's comparison", () => {
  const distDir = path.join(PACKAGE, "dist");
  const probes = {
    plain: { resident: "process.env", group: "batch" },
    allowed: { resident: "react", group: "batch" },
  };
  const carryOver = { allowed: { hot: { n: 2 }, fresh: "reset", doc: "x", exhibit: "y" } };
  const inventory = { globals: ["__DECLARED__"], console: [] };
  const run = (
    seen: Partial<Record<"isolation" | "hot" | "fresh", Record<string, unknown>>>,
    kept: Partial<Record<"hot" | "fresh", { kind: string; name: string }[]>> = {},
  ) =>
    audit({
      declared: { probes, carryOver, unprobed: [], inventory },
      observed: {
        isolation: new Map(Object.entries({ plain: 1, allowed: { n: 1 }, ...seen.isolation })),
        hot: new Map(Object.entries({ plain: 1, allowed: { n: 2 }, ...seen.hot })),
        fresh: new Map(Object.entries({ plain: 1, allowed: { n: 1 }, ...seen.fresh })),
      },
      inventory: {
        hot: (kept.hot ?? []).map((record) => ({ file: "b.test.ts", ...record })),
        fresh: (kept.fresh ?? []).map((record) => ({ file: "b.test.ts", ...record })),
      },
      distDir,
    });
  const nodeModule = (pkg: string) => `/repo/node_modules/${pkg}/index.js`;

  it("passes a reset and an allowed carry-over", () => {
    expect(run({})).toEqual([]);
  });

  it("fails a carry-over the allowlist does not name, under hot or fresh", () => {
    expect(run({ hot: { plain: 2 } })).toEqual([
      expect.stringMatching(
        /^resident plain: under hot the probe saw 2, per-file isolation gives 1, and it is not in the known-differences allowlist/,
      ),
    ]);
    expect(run({ fresh: { allowed: { n: 2 } } })).toEqual([
      expect.stringMatching(
        /^resident allowed: under fresh .* not in the known-differences allowlist/,
      ),
    ]);
  });

  it("fails an allowlist entry the runtime no longer needs", () => {
    expect(run({ hot: { allowed: { n: 1 } } })).toEqual([
      expect.stringMatching(/^allowlist stale: allowed no longer carries over under hot/),
    ]);
  });

  it("fails a carry-over that differs from the documented value", () => {
    expect(run({ hot: { allowed: { n: 3 } } })).toEqual([
      expect.stringMatching(
        /^resident allowed: under hot the probe saw \{"n":3\}, but the allowlist documents \{"n":2\}/,
      ),
    ]);
  });

  it("fails a probe that recorded nothing", () => {
    expect(run({ hot: { plain: undefined } })).toHaveLength(1);
    expect(
      audit({
        declared: { probes, carryOver, unprobed: [], inventory },
        observed: { isolation: new Map(), hot: new Map(), fresh: new Map() },
        inventory: { hot: [], fresh: [] },
        distDir,
      }),
    ).toEqual([
      "probe plain recorded nothing under per-file isolation",
      "probe allowed recorded nothing under per-file isolation",
    ]);
  });

  it("accepts the declared and source-listed globals a worker keeps, and no other", () => {
    const kept = [
      { kind: "global", name: String(RESIDENT_GLOBALS.bridge) },
      { kind: "global", name: "__DECLARED__" },
    ];
    expect(run({}, { hot: kept })).toEqual([]);
    expect(run({}, { hot: [{ kind: "global", name: "__STRAY__" }] })).toEqual([
      expect.stringMatching(
        /^unlisted resident: under hot the worker kept global __STRAY__ after b\.test\.ts/,
      ),
    ]);
    expect(run({}, { hot: [{ kind: "console", name: "stray" }] })).toHaveLength(1);
  });

  it("accepts kept modules of resident packages and the plugin's own build, and no other", () => {
    const kept = [
      { kind: "module", name: nodeModule("react") },
      { kind: "module", name: nodeModule("@testing-library/react-native") },
      { kind: "module", name: nodeModule("@react-native/virtualized-lists") },
      { kind: "module", name: nodeModule("chai") },
      { kind: "module", name: path.join(distDir, "native", "reset.mjs") },
    ];
    expect(run({}, { hot: kept })).toEqual([]);
    const stray = [
      { kind: "module", name: nodeModule("lodash") },
      { kind: "module", name: nodeModule("lodash").replace("index", "other") },
      { kind: "module", name: path.join(PACKAGE, "tests-native", "fixture.ts") },
    ];
    expect(run({}, { hot: stray })).toEqual([
      expect.stringContaining("kept module lodash after b.test.ts, not a resident package"),
      expect.stringContaining("kept module " + path.join(PACKAGE, "tests-native", "fixture.ts")),
    ]);
  });

  it("fails freshRuntime keeping a package it should load again for every file", () => {
    expect(run({}, { fresh: [{ kind: "module", name: nodeModule("react") }] })).toEqual([
      expect.stringContaining("freshRuntime loads it again for every file"),
    ]);
    expect(run({}, { fresh: [{ kind: "module", name: nodeModule("chai") }] })).toEqual([]);
  });

  it("reads a module's package from its last node_modules segment", () => {
    expect(packageOf("/a/node_modules/.bun/x@1/node_modules/@scope/pkg/dist/i.js")).toBe(
      "@scope/pkg",
    );
    expect(packageOf("C:\\a\\node_modules\\react\\index.js")).toBe("react");
    expect(packageOf("/a/src/file.js")).toBeNull();
  });

  it("reads a resident health check's refusal as the probe's observation", () => {
    expect(
      refusal(
        "VitestNativeError: [vitest-native] hotRuntime: this worker cannot run this file: React's act() scope is still open (react.act-scope) since x ended",
      ),
    ).toBe("react.act-scope");
    expect(refusal("some other failure")).toBeUndefined();
  });
});
