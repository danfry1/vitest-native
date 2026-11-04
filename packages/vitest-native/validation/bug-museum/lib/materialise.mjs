// Builds the workspace one exhibit runs in, without installing anything.
//
// An exhibit directory (../exhibits/<id>) is an app root: a vitest config, its test files,
// and optionally `packages/*` (workspace members), `vendor/*` (packages an install would
// copy into node_modules) and `src/`. It is copied to a fresh directory, and its
// node_modules is assembled from what this repository already has installed:
//
//   - every package in packages/vitest-native/node_modules, as a symlink into bun's store
//     (so every package is reached through a store path, as in an isolated install);
//   - vitest-native itself, COPIED from the build under test (package.json + dist), so
//     that its own imports (vitest, vite, @babel/core) resolve from this node_modules, as
//     they do in a consumer's install, and a different build can be swapped in;
//   - the exhibit's `vendor/*` packages, copied (a registry install copies; a `file:`
//     link would leave the real path outside node_modules);
//   - the exhibit's workspace members, linked by name (`links` in exhibits.json);
//   - the install axes the exhibit requires (exhibits.json `requires`):
//       rntl: "12" | "13"   a copy of that RNTL from a local bun store (RNTL_STORE)
//       vitest: "4"         Vitest 4.1.11 assembled from bun's cache (vitest4.mjs)
//       layout: "pnpm"      `pnpmShaped` packages moved into a pnpm-shaped store
//                           directory named after their peers (#349's class reads it)
//
// The pnpm placement and the RNTL copy are adapted from the config-axis matrix harness
// (validation/config-axes/run.mjs); its accounting and verdict rules are imported as is.
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const museumRoot = path.resolve(here, "..");
export const packageRoot = path.resolve(museumRoot, "../..");

/** Where a local bun store keeps RNTL 12 and 13 (override with VN_MUSEUM_RNTL_STORE). */
const RNTL_STORE =
  process.env.VN_MUSEUM_RNTL_STORE ??
  path.join(os.homedir(), "dev/vitest-react-native/node_modules/.bun");

/** The directory of an installed `@testing-library/react-native` of `major`, or null. */
export function findRntl(major) {
  if (!fs.existsSync(RNTL_STORE)) return null;
  const entry = fs
    .readdirSync(RNTL_STORE)
    .filter((name) => name.startsWith(`@testing-library+react-native@${major}.`))
    .sort()
    .at(-1);
  return entry ? path.join(RNTL_STORE, entry, "node_modules/@testing-library/react-native") : null;
}

function linkAll(modules, source) {
  for (const entry of fs.readdirSync(source)) {
    if (entry.startsWith(".")) continue;
    const names = entry.startsWith("@")
      ? fs.readdirSync(path.join(source, entry)).map((n) => `${entry}/${n}`)
      : [entry];
    for (const name of names) {
      const to = path.join(modules, name);
      if (fs.existsSync(to)) continue;
      let target;
      try {
        target = fs.realpathSync(path.join(source, name));
      } catch {
        continue; // a dangling link in the source tree
      }
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.symlinkSync(target, to);
    }
  }
}

function replaceWith(modules, name, from, { copy }) {
  const to = path.join(modules, name);
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (copy) fs.cpSync(from, to, { recursive: true, dereference: true });
  else fs.symlinkSync(fs.realpathSync(from), to);
}

/** Copy the package at `dir` as npm would install it: package.json + its `files`. */
function copyPackage(dir, to) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(to, { recursive: true });
  fs.copyFileSync(path.join(dir, "package.json"), path.join(to, "package.json"));
  for (const file of manifest.files ?? []) {
    const from = path.join(dir, file);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(to, file), { recursive: true });
  }
  if (!fs.existsSync(path.join(to, "dist")))
    throw new Error(`${dir} has no dist/: build it first (bun run build)`);
}

// RNTL resolves react from its real path, so it is copied, not linked; its own
// dependencies are linked from beside it in the store it came from.
function placeRntl(modules, rntl) {
  replaceWith(modules, "@testing-library/react-native", rntl, { copy: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(rntl, "package.json"), "utf8"));
  const beside = path.resolve(rntl, "../..");
  for (const dep of Object.keys(manifest.dependencies ?? {})) {
    const from = path.join(beside, dep);
    const to = path.join(modules, dep);
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.symlinkSync(fs.realpathSync(from), to);
    }
  }
}

// `node_modules/.pnpm/<name>@<version>_<peer>@<version>/node_modules/<name>`, with its
// dependencies linked beside it, as pnpm lays out a package with peers.
function placeInPnpmShape(modules, name) {
  const at = path.join(modules, name);
  if (!fs.existsSync(at)) throw new Error(`pnpmShaped: ${name} is not installed`);
  const from = fs.realpathSync(at);
  const manifest = JSON.parse(fs.readFileSync(path.join(from, "package.json"), "utf8"));
  const peers = Object.keys(manifest.peerDependencies ?? {})
    .filter((peer) => fs.existsSync(path.join(modules, peer)))
    .map((peer) => {
      const version = JSON.parse(
        fs.readFileSync(path.join(modules, peer, "package.json"), "utf8"),
      ).version;
      return `${peer.replace("/", "+")}@${version}`;
    });
  const storeModules = path.join(
    modules,
    ".pnpm",
    [`${name.replace("/", "+")}@${manifest.version}`, ...peers].join("_"),
    "node_modules",
  );
  fs.cpSync(from, path.join(storeModules, name), { recursive: true, dereference: true });
  const fromOriginal = createRequire(path.join(from, "package.json"));
  for (const [dep, base] of [
    ...Object.keys(manifest.dependencies ?? {}).map((id) => [id, "original"]),
    ...Object.keys(manifest.peerDependencies ?? {}).map((id) => [id, "workspace"]),
  ]) {
    let target = path.join(modules, dep);
    if (base === "original") {
      try {
        target = path.dirname(fromOriginal.resolve(`${dep}/package.json`));
      } catch {
        // not resolvable from there: the workspace's copy, if any
      }
    }
    if (!fs.existsSync(target) || fs.existsSync(path.join(storeModules, dep))) continue;
    fs.mkdirSync(path.dirname(path.join(storeModules, dep)), { recursive: true });
    fs.symlinkSync(fs.realpathSync(target), path.join(storeModules, dep));
  }
  fs.rmSync(at, { recursive: true, force: true });
  fs.symlinkSync(path.join(storeModules, name), at);
}

/**
 * Materialise `exhibit` (an exhibits.json entry) under `work`. Returns the app root.
 * `build` is the vitest-native package directory under test; `vitest4` the directory
 * vitest4.mjs prepared (required when the exhibit needs Vitest 4).
 */
export function materialise(exhibit, { work, build, vitest4, edits = [] }) {
  const root = path.join(work, exhibit.id);
  fs.rmSync(root, { recursive: true, force: true });
  fs.cpSync(path.join(museumRoot, "exhibits", exhibit.id), root, { recursive: true });
  // A control's edits (run.mjs --control), before anything is installed from vendor/.
  for (const edit of edits) {
    const file = path.join(root, edit.file);
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes(edit.find)) throw new Error(`control: ${edit.file} has no ${edit.find}`);
    fs.writeFileSync(file, text.replace(edit.find, edit.replace));
  }
  const modules = path.join(root, "node_modules");
  fs.mkdirSync(modules, { recursive: true });

  for (const [name, dir] of Object.entries(exhibit.links ?? {})) {
    fs.mkdirSync(path.dirname(path.join(modules, name)), { recursive: true });
    fs.symlinkSync(path.join(root, dir), path.join(modules, name));
  }
  const vendor = path.join(root, "vendor");
  if (fs.existsSync(vendor)) {
    for (const entry of fs.readdirSync(vendor)) {
      const names = entry.startsWith("@")
        ? fs.readdirSync(path.join(vendor, entry)).map((n) => `${entry}/${n}`)
        : [entry];
      for (const name of names)
        fs.cpSync(path.join(vendor, name), path.join(modules, name), { recursive: true });
    }
  }
  copyPackage(build, path.join(modules, "vitest-native"));
  linkAll(modules, path.join(packageRoot, "node_modules"));

  // Packages this package does not depend on directly but the repository's bun store has
  // (`storeLinks`: { name: version }).
  for (const [name, version] of Object.entries(exhibit.storeLinks ?? {})) {
    const store = path.join(packageRoot, "../../node_modules/.bun");
    const prefix = `${name.replace("/", "+")}@${version}`;
    const entry = fs.readdirSync(store).find((e) => e === prefix || e.startsWith(`${prefix}+`));
    if (!entry) throw new Error(`storeLinks: no ${prefix} in ${store}`);
    replaceWith(modules, name, path.join(store, entry, "node_modules", name), { copy: false });
  }

  const requires = exhibit.requires ?? {};
  if (requires.rntl) placeRntl(modules, findRntl(requires.rntl));
  if (requires.vitest === "4") {
    for (const entry of fs.readdirSync(path.join(vitest4, "node_modules"))) {
      const names = entry.startsWith("@")
        ? fs.readdirSync(path.join(vitest4, "node_modules", entry)).map((n) => `${entry}/${n}`)
        : [entry];
      for (const name of names) {
        if (name === "vitest" || name.startsWith("@vitest/"))
          replaceWith(modules, name, path.join(vitest4, "node_modules", name), { copy: false });
      }
    }
  }
  for (const name of exhibit.pnpmShaped ?? []) placeInPnpmShape(modules, name);

  // Compiled package output requires Babel's helpers by name; every real install puts
  // @babel/runtime where an installed package can resolve it.
  const runtime = path.join(modules, "@babel/runtime");
  if (!fs.existsSync(runtime)) {
    const preset = createRequire(
      fs.realpathSync(path.join(modules, "@react-native/babel-preset/package.json")),
    );
    fs.symlinkSync(path.dirname(preset.resolve("@babel/runtime/package.json")), runtime);
  }
  return root;
}
