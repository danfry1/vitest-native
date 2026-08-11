import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { AUTO_DETECT_PRESETS } from "../preset-map.js";
import { containsPath } from "./match.mjs";

/**
 * Packages that must never be auto-inlined even though they depend on React
 * Native. The test library and the renderers underneath it are infrastructure the
 * engine itself wires up; pulling a second copy of them into the module graph has
 * corrupted rendering before, in ways that surface as unrelated act() and
 * host-component failures.
 *
 * This list is one clause of the ownership rule; the whole of it is written down in
 * the header of native/apply.ts, which is the file to read before changing what ends
 * up in either graph.
 */
const NEVER_INLINE = new Set([
  "@testing-library/react-native",
  "react-test-renderer",
  "test-renderer",
  "react-native",
  // React itself, for the same reason and by the same list the engine dedupes on
  // (see `resolve.dedupe` in native/apply.ts). It is reachable: a detected package
  // declaring `react` as a runtime dependency — rather than the peer dependency it
  // should be — pulls it into the closure walk, and React is then externalized and
  // Babel-compiled as though it were untranspiled React Native source. That is
  // measurably harmless today, because Vitest externalizes the renderer stack
  // alongside it and the instance stays single, but it makes the engine's most
  // duplication-sensitive package depend on a heuristic rather than on the rule
  // stated here.
  "react",
  "react-is",
]);

/** Does this manifest offer a React Native build, by legacy field or export condition? */
function hasReactNativeBuild(manifest: Record<string, unknown>): boolean {
  if (typeof manifest["react-native"] === "string") return true;
  const seen = new Set<unknown>();
  const search = (node: unknown): boolean => {
    if (!node || typeof node !== "object" || seen.has(node)) return false;
    seen.add(node);
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "react-native") return true;
      if (search(value)) return true;
    }
    return false;
  };
  return search(manifest.exports);
}

/**
 * A package that ships ES modules and nothing React Native.
 *
 * The closure walk is a guess: a detected package's dependencies MIGHT be untranspiled
 * React Native source, because the ecosystem publishes that way and the dependency's
 * own manifest cannot say so. `"type": "module"` is the manifest saying the opposite —
 * this is runnable ES modules — and with no React Native build anywhere in it, there is
 * nothing for the preset to do. Compiling it anyway rewrites a package that publishes
 * ESM into CommonJS and hands it to Node under that format, which is how a dependency
 * reached this way (`zod`) failed to parse and took fourteen test files down with it.
 *
 * A genuine React Native library is unaffected: declaring `react-native` by field or
 * export condition keeps it in the closure however it publishes.
 *
 * Only closure MEMBERS are judged this way. A package detected on its own manifest, or
 * named in `transform: [...]`, was asked for explicitly and is still compiled.
 */
function publishesOnlyEsm(manifest: Record<string, unknown>): boolean {
  return manifest.type === "module" && !hasReactNativeBuild(manifest);
}

/** Manifest fields that make a package part of the React Native ecosystem. */
function dependsOnReactNative(manifest: Record<string, unknown>): boolean {
  for (const field of ["dependencies", "peerDependencies"]) {
    const deps = manifest[field];
    if (deps && typeof deps === "object" && "react-native" in (deps as object)) return true;
  }
  return false;
}

/**
 * Every package manifest from the project up to the filesystem root.
 *
 * A workspace does not always declare its dependencies where the tests run: an app
 * package may inherit React Native libraries from the repository root, and a Vitest
 * `root` can point at a directory above or below the package that owns them. Reading
 * only the project's own manifest silently found nothing in those layouts and sent
 * the user back to maintaining `transform: [...]` by hand.
 *
 * Over-collecting is safe and under-collecting is not: a package that is listed but
 * never imported costs nothing, because inlining only applies to files that are
 * actually loaded.
 */
/**
 * Directories of the workspace members a manifest declares, plus any listed in a
 * sibling pnpm-workspace.yaml.
 *
 * Needed because `manifestsFrom` only walks UP. In a workspace the run root is
 * frequently ABOVE the package under test — Nx invokes tasks from the workspace
 * root, and Vitest's root defaults to the working directory — so the app's own
 * dependencies are declared in a manifest that walking up never reaches. The
 * package then misses auto-detection and stays in Vite's graph while Node loads it
 * too, which is the dual-ownership failure reproducing from nothing but a different
 * working directory.
 *
 * Only the two glob shapes workspace fields actually use are expanded (`dir/*` and a
 * literal path). Over-collecting is safe here — an unimported package costs nothing —
 * so a shape that is not understood is skipped rather than approximated.
 */
function workspaceMemberDirs(dir: string, manifest: Record<string, unknown>): string[] {
  const patterns: string[] = [];
  const declared = manifest.workspaces;
  if (Array.isArray(declared)) {
    patterns.push(...declared.filter((p): p is string => typeof p === "string"));
  } else if (
    declared &&
    typeof declared === "object" &&
    Array.isArray((declared as { packages?: unknown }).packages)
  ) {
    patterns.push(
      ...(declared as { packages: unknown[] }).packages.filter(
        (p): p is string => typeof p === "string",
      ),
    );
  }
  try {
    // pnpm keeps its member list outside package.json, and pnpm workspaces are where
    // this problem was reported. Read the lines rather than adding a YAML dependency:
    // the file is a `packages:` list of quoted globs.
    const yaml = fs.readFileSync(path.join(dir, "pnpm-workspace.yaml"), "utf8");
    for (const line of yaml.split(/\r?\n/)) {
      const entry = /^\s*-\s*["']?([^"'#]+?)["']?\s*$/.exec(line);
      if (entry) patterns.push(entry[1]);
    }
  } catch {
    // No pnpm workspace file — the manifest field above is the only source.
  }

  const dirs: string[] = [];
  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const parent = path.join(dir, pattern.slice(0, -2));
      try {
        for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
          if (entry.isDirectory()) dirs.push(path.join(parent, entry.name));
        }
      } catch {
        // Declared but absent — nothing to read.
      }
    } else if (!pattern.includes("*")) {
      dirs.push(path.join(dir, pattern));
    }
  }
  return dirs;
}

function manifestsFrom(projectRoot: string): { dir: string; manifest: Record<string, unknown> }[] {
  const manifests: { dir: string; manifest: Record<string, unknown> }[] = [];
  let dir = path.resolve(projectRoot);
  for (;;) {
    try {
      const raw = fs.readFileSync(path.join(dir, "package.json"), "utf8");
      const manifest = JSON.parse(raw) as Record<string, unknown>;
      manifests.push({ dir, manifest });
      for (const member of workspaceMemberDirs(dir, manifest)) {
        try {
          manifests.push({
            dir: member,
            manifest: JSON.parse(
              fs.readFileSync(path.join(member, "package.json"), "utf8"),
            ) as Record<string, unknown>,
          });
        } catch {
          // A member directory without a readable manifest — skip it.
        }
      }
    } catch {
      // No manifest at this level, or an unreadable one — keep walking up.
    }
    const parent = path.dirname(dir);
    if (parent === dir) return manifests;
    dir = parent;
  }
}

/**
 * Packages in the project that declare React Native in their own manifest.
 *
 * These are the ones published the way the React Native ecosystem publishes:
 * untranspiled JSX, Flow, or TypeScript, on the assumption that Metro will compile
 * them. Node cannot run that source, which is why they previously had to be listed
 * by hand in `transform: [...]` — a list every project had to discover the hard way,
 * one `SyntaxError: Unexpected token '<'` at a time.
 *
 * A package's own manifest is the authority here rather than a heuristic on its
 * name: `react-native-*` misses `@gorhom/bottom-sheet` and would wrongly claim
 * `react-native` itself, while the manifest states the relationship exactly.
 *
 * Declared dependencies are read from the project and every manifest above it, so a
 * workspace that declares its React Native libraries at the repository root is covered
 * too. Resolving each name is cheap and package-manager-agnostic, where walking the
 * installed tree depends on the store layout. Transitive dependencies that nothing
 * declares stay available through `transform: [...]`.
 *
 * Excluded: packages a preset already shadows (their real source never loads), the
 * test infrastructure in NEVER_INLINE, and anything the consumer listed explicitly
 * in `transform` — that option keeps its existing meaning and takes precedence.
 */
export function detectEcosystemPackages(
  projectRoot: string | string[],
  explicit: string[] = [],
  testRoots: string[] = [],
  neverTransform: string[] = [],
): string[] {
  // More than one root because `manifestsFrom` only walks UP. In a workspace the
  // run root is often above the package under test — Nx invokes tasks from the
  // workspace root, and Vitest's root defaults to the working directory — and the
  // app's own dependencies are declared below it, so walking up from the run root
  // alone finds none of them. The package then misses auto-detection and stays in
  // Vite's graph while Node loads it too: the dual-ownership failure again, this
  // time triggered by nothing but the working directory. The config file's
  // directory is the second root, since that is where the package under test lives.
  const roots = (Array.isArray(projectRoot) ? projectRoot : [projectRoot]).filter(Boolean);
  // `neverTransform` is the user's `transform.exclude`. It joins the built-in lists
  // rather than being checked separately, so it overrides detection AND the closure
  // walk by the same mechanism they do.
  const skip = new Set<string>([
    ...NEVER_INLINE,
    ...Object.keys(AUTO_DETECT_PRESETS),
    ...explicit,
    ...neverTransform,
  ]);
  const candidates = new Set<string>();
  const found = roots.flatMap((root) => manifestsFrom(root));
  // One resolver per directory that declared something. Under pnpm a workspace
  // package is linked only into the package that depends on it, so the run root
  // often cannot resolve what the app can — resolving only from the run root is
  // how a workspace library slips past detection when the run starts above it.
  const requires = [...new Set(found.map((entry) => entry.dir))].map((dir) =>
    createRequire(path.join(dir, "package.json")),
  );
  for (const { manifest } of found) {
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
      const deps = manifest[field];
      if (deps && typeof deps === "object") {
        for (const name of Object.keys(deps as object)) candidates.add(name);
      }
    }
  }
  if (candidates.size === 0) return [];

  /** Resolve a package's manifest from whichever root can see it. */
  const manifestOf = (name: string): Record<string, unknown> | null => {
    for (const req of requires) {
      try {
        return req(`${name}/package.json`) as Record<string, unknown>;
      } catch {
        // Not resolvable from this root — try the next one.
      }
    }
    return null;
  };

  /**
   * The packages the run itself lives in — the project, in other words.
   *
   * In a workspace, the package under test is usually declared as a dependency by a
   * sibling or by the repository root, so it appears in the candidate set like any
   * third-party library — and it declares React Native, because it is React Native
   * code. Detecting it would claim the project's own source: its directory becomes a
   * `server.deps.external` pattern, so Vitest hands every file under it to Node,
   * where the loader compiles it to CommonJS. A test file's own
   * `import { it } from 'vitest'` becomes `require('vitest')`, which throws
   * "Vitest cannot be imported in a CommonJS module using require()" — a failure that
   * appears in one workspace package and not another for no visible reason.
   *
   * A package cannot be its own dependency, so a manifest whose directory contains a
   * run root belongs to the project. Read straight off the manifests already walked,
   * which is both cheaper than resolving each candidate and independent of how a
   * package manager happens to lay out its store — under pnpm every workspace member
   * is additionally linked into a hidden directory on NODE_PATH, so a package can
   * resolve its own name from its own directory, but nothing here depends on that.
   *
   * Workspace libraries the project merely depends on sit beside a run root rather
   * than above it and are unaffected — detecting those is the point of the
   * workspace-member walk above.
   */
  // `testRoots` extends this beyond the run root. Running from the repository root,
  // the root says only "the repository", so a workspace library holding the tests
  // being collected still looked like an ordinary dependency and had its whole
  // directory externalized — leaving its own source Node-owned while its tests were
  // not. A `test.include` pointing into that package identifies it directly.
  const ownerRoots = [...roots, ...testRoots];
  const runOwners = new Set(
    found
      .filter(({ dir }) => ownerRoots.some((root) => containsPath(dir, root)))
      .map(({ manifest }) => manifest.name)
      .filter((name): name is string => typeof name === "string"),
  );
  const ownsTheRun = (name: string): boolean => runOwners.has(name);

  const detected: string[] = [];
  for (const name of candidates) {
    if (skip.has(name) || name.startsWith("@react-native/")) continue;
    const pkg = manifestOf(name);
    if (pkg && dependsOnReactNative(pkg) && !ownsTheRun(name)) detected.push(name);
  }

  // A detected package's own runtime dependencies are React Native code too, and the
  // manifest test cannot see them: they are transitive, so nothing in the project
  // declares them, and the older ones frequently declare no `react-native` at all.
  //
  // react-native-modal is the case that made this concrete. It is detected, and it
  // still failed with a bare `SyntaxError: Unexpected token '<'` naming no file,
  // because the untranspiled JSX is in react-native-animatable — its dependency,
  // which declares `react-native` in neither dependencies nor peerDependencies.
  // `transform: ['react-native-modal']`, the documented remedy, does not help; only
  // naming react-native-animatable does, and nothing tells a user that.
  //
  // Membership of a detected package's dependency closure is the signal that its
  // own manifest does not carry. Runtime `dependencies` only: devDependencies are
  // not shipped, and peerDependencies are supplied by the project and reached
  // through the normal candidate set.
  //
  // React Native's OWN dependencies are excluded. The precompiled registry compiles
  // React Native's graph and reaches everything outside it — invariant, nullthrows,
  // scheduler, @babel/runtime — through a pre-resolved absolute path, i.e. Node owns
  // them. Inlining one of those into Vite as well would hand the same package two
  // owners and two instances, which is the failure the registry exists to prevent.
  // Walking react-native-modal's closure reaches `invariant` for exactly this reason,
  // and it is the one package in that closure React Native also owns.
  const rnOwned = new Set<string>(Object.keys(manifestOf("react-native")?.dependencies ?? {}));

  /** Every package reachable from `roots` through runtime dependencies. */
  const closureOf = (starts: string[]): Set<string> => {
    const seen = new Set<string>();
    const pending = [...starts];
    while (pending.length > 0) {
      const name = pending.pop() as string;
      if (seen.has(name)) continue;
      seen.add(name);
      const deps = manifestOf(name)?.dependencies;
      if (deps && typeof deps === "object") pending.push(...Object.keys(deps as object));
    }
    return seen;
  };

  // The transform loads @babel/core to do its work. Inlining anything Babel itself
  // reaches means loading that package re-enters the transform, which needs Babel,
  // which is mid-load — so it fails as `_babel.transformSync is not a function` or
  // `Cannot read properties of undefined (reading 'transformSync')`.
  //
  // `expo` declares @babel/core as a runtime dependency, so walking its closure
  // reached Babel and then Babel's own dependencies (chalk among them). Both blew up
  // the packed Expo consumer, and neither reproduced in a synthetic fixture. Excluding
  // the toolchain by name would be a list that rots; its closure computes itself.
  //
  // `@babel/runtime` and `metro` seed it alongside them, and are not reachable from
  // `@babel/core`. `@babel/runtime` holds the helpers Babel EMITS, so compiled output
  // across the ecosystem requires it at run time — including React Native's own. Metro
  // is the bundler the preset belongs to, and its `lru-cache` chain (`yallist`) is
  // loaded the same way. Both were handed to the transform by an Expo application's
  // dependency closure, and compiling them re-enters Babel mid-initialisation: the
  // reported `Cannot access 'v' before initialization`, naming a file the project never
  // mentioned.
  //
  // Seeds, not names: what each of these reaches is computed, so the list does not rot
  // as the toolchain's own dependencies change. They are skipped only as CLOSURE
  // MEMBERS — a project that genuinely depends on one still has it detected on its own
  // manifest, exactly as before.
  const toolchain = closureOf([
    "@babel/core",
    "@react-native/babel-preset",
    "@babel/runtime",
    "metro",
  ]);

  // Only packages the RUN can actually reach seed the walk.
  //
  // Candidates are collected from every manifest in the workspace, which is how a
  // library the app depends on is found at all. Applied to a closure walk, that
  // breadth stops being free: a sibling Expo application is detected on its own
  // manifest, and walking ITS dependencies drags the whole Expo and Metro toolchain —
  // several hundred packages, `@babel/runtime` and Metro's `lru-cache` chain among
  // them — into the Babel transform set of a library that depends on none of it.
  // Those are not inert. React Native and Babel load them, and compiling the
  // transform's own toolchain with the transform re-enters Babel while it is still
  // initialising, which fails as a TDZ error naming a file the project never
  // mentioned.
  //
  // So the seeds are the packages the project itself DECLARES — read from the
  // manifests that belong to the run (the package under test, and any manifest above
  // it, which is where a workspace that keeps its React Native libraries at the
  // repository root declares them). A package only a sibling declares is that
  // sibling's business.
  //
  // Declaration rather than resolvability, deliberately. Under pnpm every workspace
  // package is linked into a hidden directory placed on NODE_PATH, so in the running
  // process a sibling's dependencies DO resolve from the package under test, and a
  // reachability test quietly passes them all through. The manifest does not move.
  //
  // Only the SEEDS are filtered. A dependency reached through the walk is declared by
  // its own parent rather than by the project — that is what makes it transitive —
  // so filtering members too would undo the compilation this walk exists for.
  const projectDeclared = new Set<string>();
  for (const { dir, manifest } of found) {
    if (!ownerRoots.some((root) => containsPath(dir, root))) continue;
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
      const deps = manifest[field];
      if (deps && typeof deps === "object") {
        for (const name of Object.keys(deps as object)) projectDeclared.add(name);
      }
    }
  }

  const inClosure = new Set(detected);
  const queue = detected.filter((name) => projectDeclared.has(name));
  while (queue.length > 0) {
    const pkg = manifestOf(queue.pop() as string);
    const deps = pkg?.dependencies;
    if (!deps || typeof deps !== "object") continue;
    for (const dep of Object.keys(deps as object)) {
      if (inClosure.has(dep) || skip.has(dep) || dep.startsWith("@react-native/")) continue;
      if (rnOwned.has(dep)) continue;
      if (toolchain.has(dep)) continue;
      // A sibling that depends on the package under test would otherwise pull it
      // back in here, past the check above.
      if (ownsTheRun(dep)) continue;
      const depManifest = manifestOf(dep);
      if (!depManifest) continue; // declared but not installed
      if (publishesOnlyEsm(depManifest)) continue;
      inClosure.add(dep);
      queue.push(dep);
    }
  }

  return [...inClosure].sort();
}
