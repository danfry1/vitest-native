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
 * file that throws the moment it is required — and three of the declared CJS entries
 * do exactly that, which nothing noticed because nothing ever loaded them.
 *
 * The cause is `export * as presets` in the root entry: each preset imports `vi` from
 * vitest at module scope, so the root CJS bundle requires vitest, and vitest refuses
 * to be required from CommonJS. Every `vi` call itself sits inside a preset factory,
 * which only ever runs inside a worker, so the import is the only thing that needs to
 * move — but that is a change to how the presets are written, not to this list.
 */
const KNOWN_UNLOADABLE: Record<string, string> = {
  "./dist/index.cjs":
    "re-exports the presets, which import vitest at module scope; vitest cannot be required from CJS",
  "./dist/presets.cjs": "presets import vitest at module scope",
  "./dist/setup.cjs": "imports vitest at module scope",
};

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
});
