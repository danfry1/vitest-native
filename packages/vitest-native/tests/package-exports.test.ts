/**
 * Every declared entry point must point at a file that exists.
 *
 * The published surface is eleven `exports` subpaths, and the consumer gate
 * imports three of them. The remaining eight were covered only by
 * `@arethetypeswrong/cli` in CI — which ran with `--ignore-rules no-resolution`,
 * disabling that rule for every resolution mode. Verified by packing a build whose
 * `./presets` pointed at a non-existent file: the check exited 0 with every entry
 * point green, while the same package without that ignore reported
 * "node16 (from ESM): Resolution failed" and "bundler: Resolution failed".
 *
 * CI now uses `--profile node16`, which drops the legacy node10 noise the ignore
 * was there for while keeping the rule active where it matters. This is the local
 * half of the same guard: no network, no packing, and it fails the moment a target
 * goes missing.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {
  exports: Record<string, unknown>;
  types?: string;
  main?: string;
  module?: string;
};

/** Every `"./dist/..."` string reachable in the exports tree, with its subpath and condition. */
function declaredTargets(): Array<{ subpath: string; condition: string; target: string }> {
  const out: Array<{ subpath: string; condition: string; target: string }> = [];
  const walk = (subpath: string, node: unknown, condition: string): void => {
    if (typeof node === "string") {
      out.push({ subpath, condition, target: node });
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        walk(subpath, value, condition ? `${condition}.${key}` : key);
      }
    }
  };
  for (const [subpath, node] of Object.entries(manifest.exports)) walk(subpath, node, "");
  return out;
}

const distExists = fs.existsSync(path.join(packageRoot, "dist"));

describe("declared package entry points", () => {
  it("has a build to check against", () => {
    // Not skipped when dist is absent: silently passing would make every assertion
    // below vacuous, which is the failure mode this whole file exists to prevent.
    expect(distExists, "run `bun run build` before this suite — CI builds first").toBe(true);
  });

  it("declares more than one entry point, so the walk is not trivially empty", () => {
    expect(declaredTargets().length).toBeGreaterThan(10);
  });

  it.runIf(distExists)("points every declared target at a file that exists", () => {
    const missing = declaredTargets()
      .filter(({ target }) => !fs.existsSync(path.join(packageRoot, target)))
      .map(({ subpath, condition, target }) => `${subpath} (${condition}) -> ${target}`);
    expect(missing, `declared but absent from the build:\n${missing.join("\n")}`).toEqual([]);
  });

  it.runIf(distExists)("resolves the root fields the manifest advertises", () => {
    const rootFields = [manifest.main, manifest.module, manifest.types].filter(
      (v): v is string => typeof v === "string",
    );
    const missing = rootFields.filter((f) => !fs.existsSync(path.join(packageRoot, f)));
    expect(missing).toEqual([]);
  });
});

/**
 * Existing on disk is not the same as loading. Every check above is satisfied by a
 * file that throws the moment it is required.
 *
 * Three declared CJS entries used to do exactly that. `export * as presets` in the
 * root entry pulls in every preset, each of which imports `vi` from vitest at module
 * scope, so the root CJS bundle required vitest — and vitest throws when it is reached
 * through require(). The build no longer emits those CJS bundles: `exports` points
 * both conditions at the single .mjs build, which Node >= 20.19 loads from CommonJS
 * through require(esm). `engines` pins that floor.
 */
const KNOWN_UNLOADABLE: Record<string, string> = {};

/** Declared targets that are executable code rather than type declarations. */
function runtimeTargets(): string[] {
  return [...new Set(declaredTargets().map((t) => t.target))]
    .filter((t) => !/\.d\.(ts|mts|cts)$/.test(t))
    .sort();
}

describe("declared entry points load", () => {
  it.runIf(distExists)("has runtime targets to load", () => {
    expect(runtimeTargets().length).toBeGreaterThan(10);
  });

  it.runIf(distExists)("evaluates every entry point that is expected to load", async () => {
    const require_ = createRequire(path.join(packageRoot, "package.json"));
    const failures: string[] = [];
    const unexpectedlyFine: string[] = [];
    for (const target of runtimeTargets()) {
      const abs = path.join(packageRoot, target);
      let error: Error | null = null;
      try {
        if (target.endsWith(".cjs")) require_(abs);
        else await import(pathToFileURL(abs).href);
      } catch (caught) {
        error = caught as Error;
      }
      const known = target in KNOWN_UNLOADABLE;
      if (error && !known) failures.push(`${target}: ${error.message.split("\n")[0]}`);
      // A known-broken entry that starts working is a fix worth recording, not a
      // silent pass — otherwise this list outlives the problem it describes.
      if (!error && known) unexpectedlyFine.push(target);
    }
    expect(failures, `declared entry points that do not load:\n${failures.join("\n")}`).toEqual([]);
    expect(unexpectedlyFine, "these load now — remove them from KNOWN_UNLOADABLE").toEqual([]);
  });

  // An excuse for a target nothing declares any more reads as coverage while
  // guarding nothing. The list must only ever describe entries that still ship.
  it.runIf(distExists)("keeps no excuse for a target the manifest no longer declares", () => {
    const declared = new Set(runtimeTargets());
    const stale = Object.keys(KNOWN_UNLOADABLE).filter((t) => !declared.has(t));
    expect(
      stale,
      `KNOWN_UNLOADABLE names targets that are not declared:\n${stale.join("\n")}`,
    ).toEqual([]);
  });
});

/**
 * Loading a file by path proves the file works; it does not prove the manifest points
 * a consumer at it. The bug this suite was written for was invisible from the path
 * side — `dist/index.mjs` loaded fine the whole time — and only showed up through the
 * specifier, under the condition a CommonJS consumer actually resolves.
 *
 * Node resolves a package's own name against its `exports`, so these are the real
 * consumer paths, not an approximation of them.
 */
describe("declared subpaths load through the export map", () => {
  const specifiers = () =>
    Object.keys(manifest.exports).map((sub) =>
      sub === "." ? "vitest-native" : `vitest-native/${sub.slice(2)}`,
    );

  /** Subpaths that declare no runtime target — types-only, so nothing to execute. */
  const TYPES_ONLY = new Set(["vitest-native/rntl-matchers"]);

  it.runIf(distExists)("resolves and requires every subpath from CommonJS", () => {
    const require_ = createRequire(path.join(packageRoot, "package.json"));
    const failures: string[] = [];
    for (const spec of specifiers()) {
      if (TYPES_ONLY.has(spec)) continue;
      try {
        require_(spec);
      } catch (caught) {
        // A subpath with no `require` condition is a deliberate ESM-only entry;
        // Node reports that as a resolution error, which is honest and expected.
        const err = caught as NodeJS.ErrnoException;
        if (err.code === "ERR_PACKAGE_PATH_NOT_EXPORTED") continue;
        failures.push(`${spec}: ${String(err.message).split("\n")[0]}`);
      }
    }
    expect(failures, `subpaths that fail to require:\n${failures.join("\n")}`).toEqual([]);
  });

  it.runIf(distExists)("resolves and imports every subpath from ESM", async () => {
    const failures: string[] = [];
    for (const spec of specifiers()) {
      if (TYPES_ONLY.has(spec)) continue;
      try {
        await import(spec);
      } catch (caught) {
        failures.push(`${spec}: ${String((caught as Error).message).split("\n")[0]}`);
      }
    }
    expect(failures, `subpaths that fail to import:\n${failures.join("\n")}`).toEqual([]);
  });
});
