/**
 * Losing the precompiled registry must not be silent.
 *
 * When `buildRegistry` cannot produce a registry it returns null and React Native
 * loads file by file instead. Nothing fails and no result changes — which is
 * precisely the problem: the suite just gets slower, with no way to tell a
 * degraded run from a healthy one. Measured on this package's own native suite
 * (~42 files), that is roughly 1.4x: ~1.8s becomes ~2.5-2.8s, and the per-file
 * cost compounds on a real app suite.
 *
 * Both failure paths were quiet. The build path spoke only under `diagnostics`,
 * which defaults to false, and the cache-directory path never spoke at all. This
 * is not hypothetical: the build failed on a Windows CI runner while this was
 * being reviewed and reported nothing but a null, which is why that failure took
 * a re-run rather than a log to diagnose.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetRegistryFailureReports,
  _warnRegistryUnavailable,
  buildRegistry,
} from "../src/native/registry.mjs";

/**
 * A real directory containing an empty node_modules but no react-native.
 *
 * The node_modules matters. Node only appends its multi-line "Require stack:"
 * block when there is a module tree to report, so a fixture pointing at a path
 * that does not exist yields a tidy one-line error and never exercises the
 * collapse — which is how the first version of this file passed while the
 * collapse was removed.
 */
const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vn-registry-"));
fs.mkdirSync(path.join(projectRoot, "node_modules"), { recursive: true });
afterAll(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

const UNBUILDABLE = {
  projectRoot,
  platform: "ios" as const,
  reactNativeVersion: "0.86.0",
  assetExts: ["png"],
  diagnostics: false,
};

describe("registry fallback", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _resetRegistryFailureReports();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    _resetRegistryFailureReports();
  });

  it("warns when it cannot precompile, with diagnostics off", () => {
    expect(buildRegistry(UNBUILDABLE)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("could not precompile");
  });

  it("says the run still works and only got slower", () => {
    buildRegistry(UNBUILDABLE);
    const message = warn.mock.calls[0][0] as string;
    expect(message).toContain("slower");
    expect(message).toContain("results are unaffected");
  });

  it("names a cause rather than reporting a bare failure", () => {
    buildRegistry(UNBUILDABLE);
    // The Windows failure surfaced as "registry build returned null" and nothing
    // else, which is what made it undiagnosable.
    expect(warn.mock.calls[0][0]).toMatch(/\(.+\)/);
  });

  it("keeps the warning to one line", () => {
    // Driven directly with a multi-line cause. Going through buildRegistry here
    // would assert nothing: under this suite's config `react-native` resolves to
    // a virtual module, so the failure is always a one-line argument error and
    // the collapse is never reached. An earlier version of this test did exactly
    // that and passed with the collapse deleted.
    _warnRegistryUnavailable(
      "Cannot find module 'react-native'\nRequire stack:\n- /app/package.json",
    );
    const message = warn.mock.calls[0][0] as string;
    expect(message).not.toContain("\n");
    expect(message).toContain("Cannot find module 'react-native'");
    expect(message).not.toContain("Require stack");
  });

  it("does not repeat itself for the same cause", () => {
    buildRegistry(UNBUILDABLE);
    buildRegistry(UNBUILDABLE);
    buildRegistry({ ...UNBUILDABLE, platform: "android" });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("stays silent when the registry was switched off deliberately", () => {
    vi.stubEnv("VITEST_NATIVE_NO_REGISTRY", "1");
    try {
      expect(buildRegistry(UNBUILDABLE)).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
