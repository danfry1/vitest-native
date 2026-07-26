/**
 * The cross-check has to run from a fresh clone, because three published pages
 * tell readers to do exactly that:
 *
 *   index.md      "Anyone can run it (`bun run crosscheck`)"
 *   fidelity.md   "Reproduce it yourself: `bun run crosscheck`."
 *   comparison.md "It's reproducible — clone the repo and run `bun run crosscheck`."
 *
 * It could not. crosscheck/vitest.config.mts imports ../dist/index.mjs, dist/ is
 * gitignored, and no install hook builds it — so the command died on
 * "Could not resolve '../dist/index.mjs'" before a single probe ran. The
 * reproducibility claim is the whole basis of the fidelity page's authority, so
 * the failure was not a papercut in a dev script; it was the one instruction a
 * sceptical reader would actually run.
 *
 * Dependencies are injected so these assert the decision without running a build.
 */
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ensureBuilt } from "../scripts/ensure-built.mjs";

const ROOT = path.join(path.sep, "repo", "packages", "vitest-native");
const ENTRY = path.join(ROOT, "dist", "index.mjs");

/** A build that succeeds, and makes the entry appear as a real build would. */
function buildingRun(present: Set<string>) {
  return vi.fn(() => {
    present.add(ENTRY);
    return { status: 0 };
  });
}

describe("ensureBuilt", () => {
  it("does not build when the entry is already present", () => {
    const run = vi.fn(() => ({ status: 0 }));
    const result = ensureBuilt({
      root: ROOT,
      exists: (p: string) => p === ENTRY,
      run,
      log: () => {},
    });
    expect(run).not.toHaveBeenCalled();
    expect(result).toEqual({ built: false });
  });

  it("builds when the entry is missing", () => {
    const present = new Set<string>();
    const run = buildingRun(present);
    const result = ensureBuilt({
      root: ROOT,
      exists: (p: string) => present.has(p),
      run,
      log: () => {},
    });
    expect(result).toEqual({ built: true });
    expect(run).toHaveBeenCalledOnce();
    const [command, args, options] = run.mock.calls[0] as [string, string[], { cwd: string }];
    expect(command).toBe("bun");
    expect(args).toEqual(["run", "build"]);
    expect(options.cwd).toBe(ROOT);
  });

  it("throws with actionable guidance when the build fails", () => {
    const run = vi.fn(() => ({ status: 1 }));
    expect(() => ensureBuilt({ root: ROOT, exists: () => false, run, log: () => {} })).toThrow(
      /bun install && bun run build/,
    );
  });

  it("throws when the build reports success but produces no entry", () => {
    // A build that exits 0 without writing dist/ would otherwise hand the
    // cross-check the same unresolved-import failure this guard exists to prevent.
    const run = vi.fn(() => ({ status: 0 }));
    expect(() => ensureBuilt({ root: ROOT, exists: () => false, run, log: () => {} })).toThrow(
      /Could not build/,
    );
  });

  it("says what it is doing, since it runs inside another command", () => {
    const present = new Set<string>();
    const log = vi.fn();
    ensureBuilt({
      root: ROOT,
      exists: (p: string) => present.has(p),
      run: buildingRun(present),
      log,
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("building the plugin"));
  });
});
