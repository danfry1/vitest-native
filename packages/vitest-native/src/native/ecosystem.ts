import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { AUTO_DETECT_PRESETS } from "../preset-map.js";
import { containsPath } from "./paths.js";

/**
 * Packages that must never be auto-inlined even though they depend on React
 * Native. The test library and the renderers underneath it are infrastructure the
 * engine itself wires up; pulling a second copy of them into the module graph has
 * corrupted rendering before, in ways that surface as unrelated act() and
 * host-component failures.
 */
const NEVER_INLINE = new Set([
  "@testing-library/react-native",
  "react-test-renderer",
  "test-renderer",
  "react-native",
]);

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
  const skip = new Set<string>([...NEVER_INLINE, ...Object.keys(AUTO_DETECT_PRESETS), ...explicit]);
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
  const runOwners = new Set(
    found
      .filter(({ dir }) => roots.some((root) => containsPath(dir, root)))
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
  const toolchain = closureOf(["@babel/core", "@react-native/babel-preset"]);

  const inClosure = new Set(detected);
  const queue = [...detected];
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
      if (!manifestOf(dep)) continue; // declared but not installed
      inClosure.add(dep);
      queue.push(dep);
    }
  }

  return [...inClosure].sort();
}
