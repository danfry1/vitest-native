// Assembles Vitest 4.1.11 without a registry install, for the exhibits that need it
// (exhibits.json `requires.vitest: "4"`): vitest and its @vitest/* packages are copied
// from bun's global cache (~/.bun/install/cache, or BUN_INSTALL_CACHE_DIR) into
// `<dir>/node_modules`, and every other dependency is linked from where this
// repository's Vitest 5 resolves it (the same ranges). Returns `dir`, or null with the
// reason when the cache does not have Vitest 4.1.11 (the exhibit is then reported N/A:
// requires CI, which installs it).
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { packageRoot } from "./materialise.mjs";

export const VITEST4_VERSION = "4.1.11";

const cacheDir = () =>
  process.env.BUN_INSTALL_CACHE_DIR ?? path.join(os.homedir(), ".bun/install/cache");

function cached(name, version) {
  const [scope, base] = name.startsWith("@") ? name.split("/") : [null, name];
  const dir = scope
    ? path.join(cacheDir(), scope, `${base}@${version}@@@1`)
    : path.join(cacheDir(), `${base}@${version}@@@1`);
  return fs.existsSync(path.join(dir, "package.json")) ? dir : null;
}

/** Whether the package at `dir` has a major version `range` (^a || ^b, or x.y.z) allows. */
function sameMajor(dir, range) {
  const version = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version;
  const [major, minor] = version.split(".");
  return String(range)
    .split("||")
    .some((part) => {
      const [want, wantMinor] = part.match(/\d+(?:\.\d+)?/)?.[0].split(".") ?? [];
      // ^0.x ranges pin the minor too
      return want === major && (want !== "0" || wantMinor === minor);
    });
}

/** The newest cached `name` whose major matches `range` (^x.y.z / x.y.z), or null. */
function newestCached(name, range) {
  const major = String(range).match(/\d+/)?.[0];
  const [scope, base] = name.startsWith("@") ? name.split("/") : [null, name];
  const where = scope ? path.join(cacheDir(), scope) : cacheDir();
  if (!fs.existsSync(where)) return null;
  const versions = fs
    .readdirSync(where)
    .map((entry) =>
      entry.match(
        new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}@(\\d+)\\.(\\d+)\\.(\\d+)@@@1$`),
      ),
    )
    .filter(
      (m) =>
        m && m[1] === major && (major !== "0" || m[2] === String(range).match(/\d+\.(\d+)/)?.[1]),
    )
    .sort((a, b) => a[2] - b[2] || a[3] - b[3]);
  const best = versions.at(-1);
  return best ? path.join(where, best[0]) : null;
}

/** The directory of package `name` as `context` resolves it, or null. */
function packageDir(context, name) {
  try {
    return path.dirname(context.resolve(`${name}/package.json`));
  } catch {
    // an exports map without ./package.json: walk up from its entry
  }
  try {
    let dir = path.dirname(context.resolve(name));
    while (dir !== path.dirname(dir)) {
      const manifest = path.join(dir, "package.json");
      if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, "utf8")).name === name)
        return dir;
      dir = path.dirname(dir);
    }
  } catch {
    // not resolvable from this context
  }
  return null;
}

export function prepareVitest4(dir) {
  const modules = path.join(dir, "node_modules");
  if (fs.existsSync(path.join(modules, "vitest/package.json"))) return { dir };
  const top = cached("vitest", VITEST4_VERSION);
  if (!top) return { dir: null, reason: `vitest@${VITEST4_VERSION} is not in bun's cache` };

  // Where Vitest 5 and its @vitest/* packages resolve their dependencies from.
  const v5 = fs.realpathSync(path.join(packageRoot, "node_modules/vitest"));
  const contexts = [createRequire(path.join(v5, "package.json"))];
  const v5manifest = JSON.parse(fs.readFileSync(path.join(v5, "package.json"), "utf8"));
  for (const dep of Object.keys(v5manifest.dependencies ?? {})) {
    if (!dep.startsWith("@vitest/")) continue;
    const at = packageDir(contexts[0], dep);
    if (at) contexts.push(createRequire(path.join(at, "package.json")));
  }
  const copied = new Set();
  const fromCache = new Map();
  const queue = ["vitest"];
  while (queue.length > 0) {
    const name = queue.shift();
    if (copied.has(name)) continue;
    copied.add(name);
    const from =
      name === "vitest" ? top : (cached(name, VITEST4_VERSION) ?? fromCache.get(name) ?? null);
    if (!from) return { dir: null, reason: `${name}@${VITEST4_VERSION} is not in bun's cache` };
    fs.cpSync(from, path.join(modules, name), { recursive: true, dereference: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(from, "package.json"), "utf8"));
    for (const dep of Object.keys(manifest.dependencies ?? {})) {
      if (dep === "vitest" || dep.startsWith("@vitest/")) {
        queue.push(dep);
        continue;
      }
      const to = path.join(modules, dep);
      if (fs.existsSync(to)) continue;
      let target = null;
      for (const context of contexts) {
        const at = packageDir(context, dep);
        if (at && sameMajor(at, manifest.dependencies[dep])) {
          target = at;
          break;
        }
      }
      if (!target) {
        // A dependency Vitest 5 no longer has: the newest cached copy of the same major.
        const cachedCopy = newestCached(dep, manifest.dependencies[dep]);
        if (!cachedCopy)
          return { dir: null, reason: `cannot place ${dep} (a dependency of ${name})` };
        fromCache.set(dep, cachedCopy);
        queue.push(dep);
        continue;
      }
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.symlinkSync(fs.realpathSync(target), to);
    }
  }
  return { dir };
}
