import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  cjsConditionsWithout,
  exportTarget,
  recoverMissingReactNativeTarget,
  // @ts-expect-error — runtime .mjs, no types
} from "../src/native/export-condition-recovery.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRELOAD = path.join(HERE, "../src/native/export-condition-recovery-preload.mjs");
const tmpDirs: string[] = [];
afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// lru-cache 11.4.0+'s shape: a `react-native` CommonJS target that is not published.
const LRU_LIKE_EXPORTS = {
  ".": {
    import: { "react-native": "./dist/esm/rn/index.js", node: "./dist/esm/node/index.js" },
    require: {
      browser: "./dist/cjs/browser/index.js",
      "react-native": "./dist/cjs/rn/index.js",
      node: "./dist/cjs/node/index.js",
      default: "./dist/cjs/index.js",
    },
  },
};

function fakePackage(rnTargetShipped: boolean): { root: string; dir: string } {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-export-recovery-"));
  tmpDirs.push(root);
  const dir = path.join(root, "node_modules", "lru-like");
  fs.mkdirSync(path.join(dir, "dist/cjs/node"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "lru-like", exports: LRU_LIKE_EXPORTS }),
  );
  fs.writeFileSync(path.join(dir, "dist/cjs/node/index.js"), "module.exports = 'node build';\n");
  if (rnTargetShipped) {
    fs.mkdirSync(path.join(dir, "dist/cjs/rn"), { recursive: true });
    fs.writeFileSync(path.join(dir, "dist/cjs/rn/index.js"), "module.exports = 'rn build';\n");
  }
  return { root, dir };
}

const notFound = (dir: string) =>
  Object.assign(new Error("Cannot find module"), { code: "MODULE_NOT_FOUND", path: dir });

describe("exportTarget", () => {
  it("matches conditions in key order, nested and with default", () => {
    expect(exportTarget(LRU_LIKE_EXPORTS, ".", ["require", "react-native", "node"])).toBe(
      "./dist/cjs/rn/index.js",
    );
    expect(exportTarget(LRU_LIKE_EXPORTS, ".", ["require", "node"])).toBe(
      "./dist/cjs/node/index.js",
    );
    expect(exportTarget(LRU_LIKE_EXPORTS, ".", ["require"])).toBe("./dist/cjs/index.js");
  });

  it("handles the sugar forms and arrays", () => {
    expect(exportTarget("./main.js", ".", [])).toBe("./main.js");
    expect(exportTarget({ require: "./a.js", default: "./b.js" }, ".", ["require"])).toBe("./a.js");
    expect(exportTarget([{ worker: "./w.js" }, "./fallback.js"], ".", ["require"])).toBe(
      "./fallback.js",
    );
    expect(exportTarget({ "./x": "./x.js" }, ".", ["require"])).toBe(null);
  });

  it("resolves exact subpaths before patterns, and the longest pattern prefix", () => {
    const map = {
      "./features/*": "./src/features/*.js",
      "./features/private/*": null,
      "./features/special": "./special.js",
    };
    expect(exportTarget(map, "./features/special", [])).toBe("./special.js");
    expect(exportTarget(map, "./features/a/b", [])).toBe("./src/features/a/b.js");
    expect(exportTarget(map, "./features/private/x", [])).toBe(null);
  });

  it("breaks pattern ties as Node does: equal base, then the longer key", () => {
    // Node's patternKeyCompare ranks "./*.js" ahead of "./*" whatever the key order.
    expect(exportTarget({ "./*": "./any/*", "./*.js": "./js/*.js" }, "./a.js", [])).toBe(
      "./js/a.js",
    );
    expect(exportTarget({ "./*.js": "./js/*.js", "./*": "./any/*" }, "./a.js", [])).toBe(
      "./js/a.js",
    );
  });

  it("treats null as an exclusion in a condition object and as a fall-through in an array", () => {
    // Node stops at the first matching condition, even when its target is null.
    expect(exportTarget({ node: null, default: "./d.js" }, ".", ["node"])).toBe(null);
    expect(exportTarget([null, "./fallback.js"], ".", [])).toBe("./fallback.js");
    expect(exportTarget([], ".", [])).toBe(null);
  });
});

describe("cjsConditionsWithout", () => {
  it("keeps Node's CommonJS conditions and the process's own, minus the excluded one", () => {
    expect(
      cjsConditionsWithout(
        "react-native",
        ["--conditions", "react-native", "--conditions=development", "-C", "custom"],
        { require_module: true },
      ),
    ).toEqual(["require", "node", "node-addons", "module-sync", "development", "custom"]);
    expect(cjsConditionsWithout("react-native", [], {})).toEqual([
      "require",
      "node",
      "node-addons",
    ]);
  });
});

describe("recoverMissingReactNativeTarget", () => {
  const conditions = ["require", "node", "node-addons"];

  it("uses the target Node would pick without react-native when that one is missing", () => {
    const { dir } = fakePackage(false);
    expect(recoverMissingReactNativeTarget("lru-like", notFound(dir), conditions)).toBe(
      path.join(dir, "dist/cjs/node/index.js"),
    );
  });

  it("handles scoped packages and subpath requests", () => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-export-recovery-"));
    tmpDirs.push(root);
    const dir = path.join(root, "node_modules", "@scope", "lib");
    fs.mkdirSync(path.join(dir, "node"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "@scope/lib",
        exports: {
          "./sub/*": { "react-native": "./rn/*.js", node: "./node/*.js" },
        },
      }),
    );
    fs.writeFileSync(path.join(dir, "node", "x.js"), "");
    expect(recoverMissingReactNativeTarget("@scope/lib/sub/x", notFound(dir), conditions)).toBe(
      path.join(dir, "node", "x.js"),
    );
    expect(recoverMissingReactNativeTarget("@scope", notFound(dir), conditions)).toBe(null);
  });

  it("leaves every other failure as Node reported it", () => {
    const { dir } = fakePackage(true);
    // The react-native target exists, so this failure has some other cause.
    expect(recoverMissingReactNativeTarget("lru-like", notFound(dir), conditions)).toBe(null);
    const missing = fakePackage(false).dir;
    expect(recoverMissingReactNativeTarget("./lru-like", notFound(missing), conditions)).toBe(null);
    expect(recoverMissingReactNativeTarget("other-name", notFound(missing), conditions)).toBe(null);
    expect(
      recoverMissingReactNativeTarget(
        "lru-like",
        { ...notFound(missing), code: "ERR_X" },
        conditions,
      ),
    ).toBe(null);
    // A fallback target that is also missing is no recovery.
    expect(
      recoverMissingReactNativeTarget("lru-like", notFound(missing), conditions, () => false),
    ).toBe(null);
  });
});

describe("the worker preload", () => {
  // The way a Vitest worker runs: `--conditions react-native` forwarded by Vitest,
  // then the plugin's preload, then a CommonJS require of the package.
  const run = (preload: boolean) => {
    const { root } = fakePackage(false);
    return spawnSync(
      process.execPath,
      [
        "--conditions",
        "react-native",
        ...(preload ? ["--import", pathToFileURL(PRELOAD).href] : []),
        "-e",
        "process.stdout.write(require('lru-like'))",
      ],
      { cwd: root, encoding: "utf8" },
    );
  };

  it("loads a package whose react-native target was never published", () => {
    const result = run(true);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("node build");
  });

  it("installs once per process, even after another patch wraps it", () => {
    const recovery = pathToFileURL(path.join(HERE, "../src/native/export-condition-recovery.mjs"));
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import Module from "node:module";
         const { installExportConditionRecovery } = await import(${JSON.stringify(recovery.href)});
         installExportConditionRecovery();
         const inner = Module._resolveFilename;
         Module._resolveFilename = function (...args) { return inner.apply(this, args); };
         const outer = Module._resolveFilename;
         installExportConditionRecovery();
         process.stdout.write(String(Module._resolveFilename === outer));`,
      ],
      { encoding: "utf8" },
    );
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("true");
  });

  it("is what makes it load: without it Node fails on the missing file", () => {
    const result = run(false);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Cannot find module .*dist[\\/]cjs[\\/]rn[\\/]index\.js/);
  });
});
