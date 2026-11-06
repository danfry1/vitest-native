/**
 * Workers build the ownership policy from directories the plugin resolved at config
 * time (`packageDirs` in the project context), and build it once per thread for one set
 * of inputs: the ESM loader and the require hooks share it. Count-based: a resolver that
 * counts its calls, and the thread's build counter.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reactNative } from "../src/index.js";
import {
  recordedPackageDirOf,
  workerOwnershipPolicy,
  workerOwnershipPolicyBuilds,
} from "../src/native/ownership.mjs";
// @ts-expect-error — runtime .mjs, no types
import { packageDirOf } from "../src/native/match.mjs";
import { contextOf } from "./project-context-helpers.js";
import { runPluginConfig } from "./plugin-config.js";

const STATE = Symbol.for("vitest-native.ownership.worker-policies");
const root = fs.realpathSync(os.tmpdir());

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[STATE];
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("recordedPackageDirOf", () => {
  it("answers a recorded package from the recorded root without resolving", () => {
    let calls = 0;
    const dirOf = recordedPackageDirOf(
      { root, dirs: { "pkg-a": "/linked/pkg-a", "pkg-missing": null } },
      () => {
        calls++;
        return "/resolved";
      },
    );
    expect(dirOf("pkg-a", root)).toBe("/linked/pkg-a");
    expect(dirOf("pkg-missing", root)).toBeNull();
    expect(calls).toBe(0);
  });

  it("resolves anything else, once per question", () => {
    let calls = 0;
    const dirOf = recordedPackageDirOf({ root, dirs: { "pkg-a": "/linked/pkg-a" } }, () => {
      calls++;
      return "/resolved";
    });
    expect(dirOf("pkg-b", root)).toBe("/resolved");
    expect(dirOf("pkg-b", root)).toBe("/resolved");
    // A recorded name asked from another directory is a different question.
    expect(dirOf("pkg-a", path.join(root, "elsewhere"))).toBe("/resolved");
    expect(calls).toBe(2);
  });

  it("resolves everything when the context has no recorded directories", () => {
    let calls = 0;
    const dirOf = recordedPackageDirOf(undefined, () => {
      calls++;
      return null;
    });
    expect(dirOf("pkg-a", root)).toBeNull();
    expect(calls).toBe(1);
  });
});

describe("workerOwnershipPolicy", () => {
  // Directories that do not exist: a policy that resolved them would get null back.
  const context = {
    packageDirs: { root, dirs: { "vn-recorded-only": path.join(root, "vn-recorded-only-dir") } },
  };
  const inputs = { projectRoot: root, runtimeTransforms: ["vn-recorded-only"] };

  it("builds once for the same inputs, whoever asks", () => {
    const loaderPolicy = workerOwnershipPolicy(inputs, context);
    const hooksPolicy = workerOwnershipPolicy(
      { ...inputs, projectDirs: [], reactNativeRoots: [] },
      context,
    );
    expect(hooksPolicy).toBe(loaderPolicy);
    expect(workerOwnershipPolicyBuilds()).toBe(1);
  });

  it("builds again for a different transform list", () => {
    workerOwnershipPolicy(inputs, context);
    workerOwnershipPolicy({ ...inputs, runtimeTransforms: ["vn-recorded-only", "other"] }, context);
    expect(workerOwnershipPolicyBuilds()).toBe(2);
  });

  it("takes package directories from the context", () => {
    const policy = workerOwnershipPolicy(inputs, context);
    expect(policy.packageDirOf("vn-recorded-only")).toBe(path.join(root, "vn-recorded-only-dir"));
    expect(
      policy.matchesNodeTransformedFile(`${path.join(root, "vn-recorded-only-dir")}/index.js`),
    ).toBe(true);
  });
});

describe("the project context", () => {
  it("records the directory of every package Node transforms, from the project root", async () => {
    vi.stubEnv("VITEST_NATIVE_NO_REGISTRY", "1");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
    const context = contextOf(
      await runPluginConfig(reactNative({ engine: "native" }), { root: packageRoot }),
    );
    expect(context.transform?.length ?? 0).toBeGreaterThan(0);
    expect(context.packageDirs?.root).toBe(path.resolve(packageRoot));
    expect(Object.keys(context.packageDirs?.dirs ?? {}).sort()).toEqual(
      [...(context.transform ?? [])].sort(),
    );
    // The answers a worker would have resolved itself: packageDirOf from the project root.
    for (const [name, dir] of Object.entries(context.packageDirs?.dirs ?? {})) {
      expect([name, dir]).toEqual([name, packageDirOf(name, packageRoot)]);
    }
  });
});
