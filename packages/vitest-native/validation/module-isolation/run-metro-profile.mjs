/**
 * Real-framework gate for project-scoped Metro profile ingestion.
 *
 * Unit fixtures prove orchestration and failures. This script proves the data
 * against the actual Expo and React Native Metro packages installed by the
 * repository, while also measuring that those graphs die with the child rather
 * than remaining in Vite's main process.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMetroProfile } from "../../src/native/metro-profile.mjs";
import { resolvePlatformFile } from "../../src/native/resolve.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../..");
const workspaceRoot = path.resolve(packageRoot, "../..");
const bunStore = path.join(workspaceRoot, "node_modules/.bun");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vn-real-metro-profile-"));

function bundleNodeModules(prefix, requiredPath) {
  const matches = fs
    .readdirSync(bunStore)
    .filter((name) => name.startsWith(prefix))
    .sort();
  for (const name of matches) {
    const modules = path.join(bunStore, name, "node_modules");
    if (fs.existsSync(path.join(modules, requiredPath))) return modules;
  }
  throw new Error(`No installed ${prefix} bundle contains ${requiredPath}`);
}

function linkedProject(name, modules) {
  const root = path.join(tempRoot, name);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name, private: true }));
  fs.symlinkSync(
    modules,
    path.join(root, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  return root;
}

function mib(bytes) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

try {
  global.gc?.();
  const baselineRss = process.memoryUsage().rss;

  const rnRoot = linkedProject(
    "bare",
    bundleNodeModules("@react-native+metro-config@", "@react-native/metro-config/package.json"),
  );
  const rn = await loadMetroProfile({ projectRoot: rnRoot, platform: "ios" });
  assert.equal(rn.profile.framework, "react-native");
  assert.deepEqual(rn.profile.sourceExts, ["js", "jsx", "json", "ts", "tsx"]);
  assert.deepEqual(rn.profile.resolverMainFields, ["react-native", "browser", "main"]);
  assert.deepEqual(rn.profile.conditionNames, ["react-native"]);

  const expoRoot = linkedProject("expo", bundleNodeModules("expo@", "expo/package.json"));
  const expo = await loadMetroProfile({ projectRoot: expoRoot, platform: "ios" });
  assert.equal(expo.profile.framework, "expo");
  assert.deepEqual(expo.profile.sourceExts.slice(0, 7), [
    "ts",
    "tsx",
    "mjs",
    "js",
    "jsx",
    "json",
    "cjs",
  ]);
  assert.ok(expo.profile.assetExts.includes("avif"));
  assert.ok(expo.profile.assetExts.includes("db"));
  assert.deepEqual(expo.profile.conditionNames, ["react-native"]);

  // Discriminating layout: bare Metro and Expo intentionally choose different
  // files because sourceExts itself is precedence, not just an allow-list.
  const variants = path.join(tempRoot, "variants");
  fs.mkdirSync(variants);
  const base = path.join(variants, "Feature");
  fs.writeFileSync(base + ".js", "module.exports = 'js';");
  fs.writeFileSync(base + ".tsx", "export default 'tsx';");
  assert.equal(resolvePlatformFile(base, "ios", rn.profile.sourceExts), base + ".js");
  assert.equal(resolvePlatformFile(base, "ios", expo.profile.sourceExts), base + ".tsx");

  global.gc?.();
  const parentDelta = process.memoryUsage().rss - baselineRss;
  // Importing Expo Metro in this process measured ~50 MiB retained. The bounded
  // path should stay far below that; generous headroom avoids allocator noise.
  assert.ok(
    parentDelta < 32 * 1024 * 1024,
    `parent retained ${mib(parentDelta)} MiB after bounded profile loads`,
  );

  console.log(
    JSON.stringify(
      {
        result: "pass",
        parentRssDeltaMiB: mib(parentDelta),
        reactNative: {
          durationMs: rn.evidence.durationMs,
          childRssMiB: mib(rn.evidence.rss),
          sourceExts: rn.profile.sourceExts,
        },
        expo: {
          durationMs: expo.evidence.durationMs,
          childRssMiB: mib(expo.evidence.rss),
          sourceExts: expo.profile.sourceExts,
          extraAssets: ["avif", "db"].filter((ext) => expo.profile.assetExts.includes(ext)),
        },
        discriminatingResolution: { reactNative: "Feature.js", expo: "Feature.tsx" },
      },
      null,
      2,
    ),
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
