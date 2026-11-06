/**
 * Project-scoped module ownership policy for the native engine.
 *
 * This module does not resolve or load anything. It turns already-established
 * project facts into the patterns and predicates consumed by Vitest config, the
 * CommonJS hook, the ESM loader, hot reset, and diagnostics. Keeping it pure lets
 * the Vite main process and every worker reconstruct the same decision.
 */
import path from "node:path";
import { projectContext } from "../context.mjs";
import {
  NODE_MODULES_PATH,
  REACT_NATIVE_PATH,
  buildPkgMatcher,
  containsPath,
  installedPackageDirOf,
  memoizePackageDirOf,
  packagePatterns,
} from "./match.mjs";

const OUTSIDE_NODE_MODULES = String.raw`^(?!.*[\\/]node_modules[\\/])`;

/**
 * Files Vitest may execute as entries. They always belong to Vite.
 *
 * Test files are recognised by name. A setup file has no naming convention, so the
 * project's `test.setupFiles` are passed in as `entryFiles` instead (see decideFile).
 */
export const TEST_ENTRY_PATTERNS = Object.freeze([
  new RegExp(String.raw`${OUTSIDE_NODE_MODULES}.*\.(?:test|spec)\.[cm]?[jt]sx?$`),
  new RegExp(String.raw`${OUTSIDE_NODE_MODULES}.*[\\/]__tests__[\\/].*\.[cm]?[jt]sx?$`),
]);

/**
 * Identity-sensitive runtime packages whose CJS entries cannot be dropped while
 * their ESM entries remain resident. Shared by ESM generation and hot CJS reset.
 */
export const RUNTIME_RESIDENT_PACKAGES = Object.freeze([
  "react",
  "react-is",
  "react-dom",
  "scheduler",
  "react-reconciler",
  "react-test-renderer",
  "test-renderer",
  "@testing-library/react-native",
]);

export const RUNTIME_RESIDENT_PATH =
  /[\\/]node_modules[\\/](react|react-is|react-dom|scheduler|react-reconciler|react-test-renderer|test-renderer|@testing-library[\\/]react-native)[\\/]/;

/** The test runner/runtime must never receive per-file ESM generation stamps. */
export const TEST_RUNTIME_RESIDENT_PACKAGES = Object.freeze([
  "vitest",
  "@vitest/*",
  "chai",
  "vitest-native",
]);

export const TEST_RUNTIME_RESIDENT_PATH =
  /[\\/]node_modules[\\/](vitest|@vitest[\\/][^\\/]+|chai|vitest-native)[\\/]/;

const normalizeFile = (file) => file.replace(/\\/g, "/");
// Vite module ids may carry `?query` / `#fragment` suffixes. Ownership is a
// property of the resolved file, not a loader query; leaving the suffix attached
// makes the anchored test-entry patterns miss an otherwise ordinary test file.
const cleanRawFileId = (file) => file.replace(/[?#].*$/, "");
const cleanFileId = (file) => normalizeFile(cleanRawFileId(file));
const unique = (values) => [...new Set((values || []).filter(Boolean))];
const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function isRuntimeResidentFile(file) {
  return RUNTIME_RESIDENT_PATH.test(normalizeFile(file));
}

export function isTestRuntimeResidentFile(file) {
  return TEST_RUNTIME_RESIDENT_PATH.test(normalizeFile(file));
}

/**
 * A package the resident rules above keep at one instance per worker, by name: React
 * Native, the identity-sensitive runtime and the test stack. The same patterns, tested
 * against the name, so a vendored copy outside node_modules is held to the same rule.
 */
export function isResidentPackageName(name) {
  const file = `/node_modules/${name}/`;
  return (
    REACT_NATIVE_PATH.test(file) ||
    RUNTIME_RESIDENT_PATH.test(file) ||
    TEST_RUNTIME_RESIDENT_PATH.test(file)
  );
}

function decision(owner, format, transform, reset, reasons, evidence) {
  return Object.freeze({
    owner,
    format,
    transform,
    reset,
    reason: reasons[0],
    reasons: Object.freeze(reasons),
    evidence: Object.freeze(evidence),
  });
}

/**
 * Build one immutable policy for a Vitest project.
 *
 * `explicitTransforms` is the public `transform` include list.
 * `ecosystemPackages` is the detected RN dependency closure.
 * `runtimeTransforms` is for workers reconstructing the already-combined list from
 * serialized setup data; config-time callers normally leave it empty.
 *
 * `packageDirOf` finds each package's directory. Each package is looked up once per
 * policy whatever is passed (the patterns and every matcher share the answers); a
 * caller that has already resolved the same packages from the same root passes its
 * own memoized lookup (memoizePackageDirOf) so they are not resolved again.
 */
/**
 * TypeScript source in an installed package (not a declaration file): Node's (#544).
 * Node already compiles it for both a require (hooks.mjs, the `.ts`/`.tsx` handlers) and
 * an import (loader.mjs, NODE_MODULES_TS, one CommonJS instance), but Vitest inlines a
 * file Node cannot run as published, so Vite evaluated a second copy for an import.
 * Externalizing it leaves the one copy Node compiles. The same extensions as Node's
 * handlers: an `.mts` or `.cts` file has none, and stays Vitest's to decide.
 */
export const INSTALLED_TYPESCRIPT = /[\\/]node_modules[\\/].*(?<!\.d)\.tsx?$/;
const isInstalledTypeScript = (file) => INSTALLED_TYPESCRIPT.test(file.replace(/[?#].*$/, ""));

export function createNativeOwnershipPolicy({
  projectRoot = process.cwd(),
  explicitTransforms = [],
  ecosystemPackages = [],
  runtimeTransforms = [],
  runtimeTransformAugmentations = [],
  projectDirs = [],
  reactNativeRoots = [],
  entryFiles = [],
  serverDepsInlineAll = false,
  // Whether an installed package's TypeScript source is Node's (#544). Only with nodeMocks
  // on (experimental.nodeMocks, or ownershipModel 'resolution'): there a vi.mock reaches
  // what Node loads, so moving these files to Node keeps every mock reaching them. With
  // it off, a package Vite inlines is the only route for a vi.mock to reach its imports,
  // so Vitest keeps deciding. Workers read it from their context (the plugin sets
  // `nodeMocks` there from the same condition).
  installedTypeScriptToNode = projectContext()?.nodeMocks === true,
  packageDirOf,
} = {}) {
  const dirOf = memoizePackageDirOf(packageDirOf);
  const enforcement = serverDepsInlineAll ? "overridden-by-inline-all" : "enforced";
  const root = path.resolve(projectRoot);
  const explicit = unique(explicitTransforms);
  const explicitSet = new Set(explicit);
  const ecosystem = unique(ecosystemPackages).filter((name) => !explicitSet.has(name));
  const runtime = unique(runtimeTransforms).filter(
    (name) => !explicitSet.has(name) && !ecosystem.includes(name),
  );
  const runtimeAugmentations = Object.freeze(unique(runtimeTransformAugmentations));
  const nodeTransformPackages = Object.freeze([...explicit, ...ecosystem, ...runtime]);
  // A workspace/file-linked react-native resolves to its real directory, which may
  // not contain a node_modules segment. Node ownership is semantic, not a path-layout
  // heuristic, so index that real root explicitly. Unlike generic packagePatterns,
  // this root is never dropped merely because it sits below the project root: RN is
  // the engine even when it is vendored in the workspace. Test entries still win.
  const inferredReactNativeRoot = installedPackageDirOf("react-native", root);
  const normalizedReactNativeRoots = Object.freeze(
    unique([inferredReactNativeRoot, ...reactNativeRoots]).map((dir) => path.resolve(dir)),
  );
  // Either separator at every boundary: these patterns are handed to Vitest's resolver
  // and also meet paths in the form Node reports them, backslashed on Windows.
  const reactNativeRootPatterns = normalizedReactNativeRoots.map(
    (dir) =>
      new RegExp(
        `^${normalizeFile(dir).replace(/\/$/, "").split("/").map(escapeRe).join("[\\\\/]")}[\\\\/]`,
      ),
  );
  const isReactNativeCore = (file, rawFile) =>
    REACT_NATIVE_PATH.test(file) ||
    normalizedReactNativeRoots.some((dir) => containsPath(dir, cleanRawFileId(rawFile)));
  const reactNativePathFor = (rawFile) => {
    const clean = cleanRawFileId(rawFile);
    const file = normalizeFile(clean);
    if (REACT_NATIVE_PATH.test(file)) return file;
    const packageRoot = normalizedReactNativeRoots.find((dir) => containsPath(dir, clean));
    if (!packageRoot) return null;
    const relative = normalizeFile(path.relative(packageRoot, clean));
    return `/react-native/${relative}`;
  };
  // Framework boundary: Vitest sorts resolver pattern arrays in place while it
  // constructs VitestResolver. Keep the POLICY immutable, but hand mutation-prone
  // consumers their own mutable arrays (the first frozen version passed every unit
  // test and failed before native test collection with "Cannot assign to read only
  // property '0'"). The rules and serialized manifest remain deeply immutable.
  const externalPatterns = [
    REACT_NATIVE_PATH,
    ...reactNativeRootPatterns,
    ...(installedTypeScriptToNode ? [INSTALLED_TYPESCRIPT] : []),
    ...nodeTransformPackages.flatMap((name) => packagePatterns(name, root, dirOf)),
  ];
  const matchesNodeTransformedFile = buildPkgMatcher(nodeTransformPackages, root, dirOf);
  const explicitMatcher = buildPkgMatcher(explicit, root, dirOf);
  const ecosystemMatcher = buildPkgMatcher(ecosystem, root, dirOf);
  const runtimeMatcher = buildPkgMatcher(runtime, root, dirOf);
  const normalizedProjectDirs = Object.freeze(unique(projectDirs).map((dir) => path.resolve(dir)));
  const normalizedEntryFiles = Object.freeze(unique(entryFiles).map((file) => path.resolve(file)));
  const entryKey = (file) => {
    const resolved = path.resolve(file);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  const entryKeys = new Set(normalizedEntryFiles.map(entryKey));

  const decideFile = (rawFile) => {
    const file = cleanFileId(rawFile);
    if (TEST_ENTRY_PATTERNS.some((pattern) => pattern.test(file))) {
      return decision("vite", "source", "vite", "per-file", ["test-entry"], [file]);
    }
    // A setup file is an entry too: Vitest inlines `test.setupFiles` ahead of every
    // `server.deps.external` pattern (its `inlineFiles`), so Vite evaluates one wherever
    // it lives. The policy has to say the same, or a setup file inside a Node-owned
    // package is refused as MODULE_OWNER_CONFLICT before it runs. The case that showed
    // it: an app listing a sibling workspace library's own `vitest.setup.ts`, where the
    // library declares react-native and is therefore Node-owned (ADR-0004 rule 7).
    //
    // Only the entry changes owner. What it imports is decided file by file, so the
    // library's source stays with Node and the test and the setup file share its one
    // instance. Two broader answers were rejected:
    //   - Leaving every workspace package (real path outside node_modules) to Vite.
    //     Detected workspace members are Node-owned on purpose (which members are
    //     detected is dependencyDirOf's rule, in match.mjs): Vite's
    //     compile changes class fields, EXPO_OS and the worklet plugin, and a member that
    //     an installed package also requires loads twice when Vite owns it.
    //   - Not detecting a package that holds a setup file. A setup file says nothing
    //     about how the package's source must be compiled, and it would give one library
    //     two owners depending on which app's config runs it.
    // As with test files, a setup file under node_modules is left to the rules below.
    //
    // Only Vite's transform hook (plugin.ts) judges a setup file, so only the main
    // process passes `entryFiles`. Workers judge Node's loads by package matchers;
    // their one call to decideFile is the project-source resolution warning
    // (hooks.mjs checkProjectSourceResolvedByNode), which has no use for entry files,
    // since Vitest's runner imports a setup file through Vite. The manifest carries the
    // list for diagnostics.
    if (
      entryKeys.size > 0 &&
      !NODE_MODULES_PATH.test(file) &&
      entryKeys.has(entryKey(cleanRawFileId(rawFile)))
    ) {
      return decision(
        "vite",
        "source",
        "vite",
        "per-file",
        ["test-entry"],
        ["test.setupFiles", file],
      );
    }
    const runtimeResident = isRuntimeResidentFile(file);
    const testRuntimeResident = isTestRuntimeResidentFile(file);
    if (isReactNativeCore(file, rawFile)) {
      return decision(
        "node",
        "cjs",
        "registry",
        "worker-resident",
        ["react-native-core"],
        [
          normalizedReactNativeRoots.find((dir) => containsPath(dir, cleanRawFileId(rawFile))) ??
            "react-native/@react-native path",
          "preloaded before the hot reset baseline",
        ],
      );
    }
    if (!NODE_MODULES_PATH.test(file)) {
      const projectDir = normalizedProjectDirs.find((dir) =>
        containsPath(dir, cleanRawFileId(rawFile)),
      );
      if (projectDir) {
        return decision("vite", "source", "vite", "per-file", ["project-source"], [projectDir]);
      }
    }
    if (explicitMatcher(file)) {
      return decision(
        "node",
        "package",
        "native-babel",
        runtimeResident ? "worker-resident" : "per-file",
        runtimeResident
          ? ["explicit-transform", "identity-sensitive-runtime"]
          : ["explicit-transform"],
        runtimeResident
          ? ["reactNative.transform.include", "CJS/ESM identity must remain stable"]
          : ["reactNative.transform.include"],
      );
    }
    if (ecosystemMatcher(file)) {
      return decision(
        "node",
        "package",
        "native-babel",
        runtimeResident ? "worker-resident" : "per-file",
        runtimeResident
          ? ["ecosystem-detected", "identity-sensitive-runtime"]
          : ["ecosystem-detected"],
        runtimeResident
          ? ["React Native dependency closure", "CJS/ESM identity must remain stable"]
          : ["React Native dependency closure"],
      );
    }
    if (runtimeMatcher(file)) {
      return decision(
        "node",
        "package",
        "native-babel",
        runtimeResident ? "worker-resident" : "per-file",
        runtimeResident
          ? ["runtime-transform", "identity-sensitive-runtime"]
          : ["runtime-transform"],
        runtimeResident
          ? ["serialized worker transform set", "CJS/ESM identity must remain stable"]
          : ["serialized worker transform set"],
      );
    }
    if (installedTypeScriptToNode && isInstalledTypeScript(file)) {
      return decision(
        "node",
        "package",
        "native-babel",
        runtimeResident ? "worker-resident" : "per-file",
        ["installed-typescript"],
        ["TypeScript source under node_modules, compiled by Node for require and import"],
      );
    }
    if (runtimeResident) {
      return decision(
        "vitest-default",
        "package",
        "default",
        "worker-resident-if-external",
        ["identity-sensitive-runtime"],
        [
          "Vitest decides whether this package is inlined or external",
          "if external, CJS/ESM identity must remain stable",
        ],
      );
    }
    if (testRuntimeResident) {
      return decision(
        "vitest-default",
        "package",
        "default",
        "worker-resident-if-external",
        ["test-runtime"],
        [
          "Vitest decides whether this package is inlined or external",
          "if external, runner identity must remain stable",
        ],
      );
    }
    return decision(
      "vitest-default",
      "unknown",
      "default",
      "vitest-default",
      ["delegated"],
      ["not governed by native ownership policy"],
    );
  };

  const manifest = () =>
    Object.freeze({
      version: 1,
      enforcement,
      projectRoot: root,
      projectDirs: normalizedProjectDirs,
      entryFiles: normalizedEntryFiles,
      reactNativeRoots: normalizedReactNativeRoots,
      nodeTransformPackages,
      runtimeTransformAugmentations: runtimeAugmentations,
      identityResidentPackages: RUNTIME_RESIDENT_PACKAGES,
      testRuntimeResidentPackages: TEST_RUNTIME_RESIDENT_PACKAGES,
      rules: Object.freeze([
        Object.freeze({
          effect: "owner-transform-reset",
          owner: "node",
          transform: "registry",
          reset: "worker-resident",
          reason: "react-native-core",
          packages: Object.freeze(["react-native", "@react-native/*"]),
          roots: normalizedReactNativeRoots,
        }),
        Object.freeze({
          effect: "owner-transform",
          owner: "node",
          transform: "native-babel",
          reason: "explicit-transform",
          packages: Object.freeze(explicit),
        }),
        Object.freeze({
          effect: "owner-transform",
          owner: "node",
          transform: "native-babel",
          reason: "ecosystem-detected",
          packages: Object.freeze(ecosystem),
        }),
        Object.freeze({
          effect: "owner-transform",
          owner: "node",
          transform: "native-babel",
          reason: "runtime-transform",
          packages: Object.freeze(runtime),
        }),
        Object.freeze({
          effect: "owner-transform-reset",
          owner: "vite",
          transform: "vite",
          reset: "per-file",
          reason: "project-source",
          roots: normalizedProjectDirs,
        }),
        Object.freeze({
          effect: "owner-transform-reset",
          owner: "vite",
          transform: "vite",
          reset: "per-file",
          reason: "test-entry",
          patterns: Object.freeze(TEST_ENTRY_PATTERNS.map(String)),
          files: normalizedEntryFiles,
        }),
        Object.freeze({
          effect: "reset-if-external",
          reset: "worker-resident",
          reason: "identity-sensitive-runtime",
          packages: RUNTIME_RESIDENT_PACKAGES,
        }),
        Object.freeze({
          effect: "reset-if-external",
          reset: "worker-resident",
          reason: "test-runtime",
          packages: TEST_RUNTIME_RESIDENT_PACKAGES,
        }),
      ]),
    });

  return Object.freeze({
    enforcement,
    projectRoot: root,
    nodeTransformPackages,
    externalPatterns,
    testEntryPatterns: [...TEST_ENTRY_PATTERNS],
    matchesNodeTransformedFile,
    isReactNativeFile: (file) => isReactNativeCore(cleanFileId(file), file),
    reactNativePathFor,
    decideFile,
    manifest,
    packageDirOf: (name) => dirOf(name, root),
  });
}

/**
 * Compare an actual graph observation with the owner assigned by the project.
 * Delegated packages are intentionally inconclusive: Vitest is allowed to inline or
 * externalize them. Likewise an inline-all override disables enforcement because it
 * has explicitly taken precedence over the engine's externalization rules.
 */
export function findNativeOwnershipConflict(policy, file, observedOwner) {
  if (!policy || policy.enforcement !== "enforced") return null;
  if (observedOwner !== "vite" && observedOwner !== "node") return null;
  const expected = policy.decideFile(file);
  if (expected.owner === "vitest-default" || expected.owner === observedOwner) return null;
  return Object.freeze({
    code: "NATIVE_MODULE_OWNER_CONFLICT",
    file,
    observedOwner,
    expectedOwner: expected.owner,
    decision: expected,
  });
}

/**
 * Node-owned packages a Vitest inline rule would claim before externalization.
 * Matching mirrors Vitest's `matchPattern`: strings are fragments below a module
 * directory and regular expressions test the normalized resolved id.
 */
export function findNativeInlineConflicts(policy, inline) {
  if (!policy || inline == null) return [];
  if (inline === true) return ["*"];
  const patterns = Array.isArray(inline) ? inline : [inline];
  const packages = ["react-native", "@react-native/*", ...policy.nodeTransformPackages];
  const conflicts = [];
  for (const name of packages) {
    const concrete = name === "@react-native/*" ? "@react-native/assets-registry" : name;
    const probes = [
      `/project/node_modules/${concrete}/index.js`,
      `C:\\project\\node_modules\\${concrete.replaceAll("/", "\\")}\\index.js`,
    ];
    const dir = name.includes("*") ? null : policy.packageDirOf(name);
    if (dir) probes.push(`${normalizeFile(dir).replace(/\/$/, "")}/index.js`);
    const hit = patterns.some((pattern) => {
      if (typeof pattern === "string") {
        const fragment = `/node_modules/${pattern.replace(/^[/\\]+/, "")}`;
        return probes.some((probe) => normalizeFile(probe).includes(fragment));
      }
      if (!pattern || typeof pattern.test !== "function") return false;
      return probes.some((probe) => {
        pattern.lastIndex = 0;
        const matched = pattern.test(normalizeFile(probe));
        pattern.lastIndex = 0;
        return matched;
      });
    });
    if (hit) conflicts.push(name);
  }
  return [...new Set(conflicts)];
}

/**
 * Parse the project policy passed across the Vitest worker boundary.
 *
 * Treat environment data as untrusted even though the plugin produced it: users can
 * set `test.env`, and a malformed diagnostic must never stop a test run. Unknown
 * manifest versions deliberately return null rather than being guessed at.
 */
export function parseNativeOwnershipManifest(raw) {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object" || value.version !== 1) return null;
    if (value.enforcement !== "enforced" && value.enforcement !== "overridden-by-inline-all") {
      return null;
    }
    if (typeof value.projectRoot !== "string") return null;
    if (
      value.entryFiles !== undefined &&
      !(
        Array.isArray(value.entryFiles) &&
        value.entryFiles.every((entry) => typeof entry === "string")
      )
    ) {
      return null;
    }
    for (const key of [
      "projectDirs",
      "reactNativeRoots",
      "nodeTransformPackages",
      "runtimeTransformAugmentations",
      "identityResidentPackages",
      "testRuntimeResidentPackages",
      "rules",
    ]) {
      if (!Array.isArray(value[key])) return null;
    }
    if (
      ![
        ...value.projectDirs,
        ...value.reactNativeRoots,
        ...value.nodeTransformPackages,
        ...value.runtimeTransformAugmentations,
        ...value.identityResidentPackages,
        ...value.testRuntimeResidentPackages,
      ].every((entry) => typeof entry === "string")
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/** Human-readable lines for diagnostics and `doctor`; generated from the manifest. */
export function formatNativeOwnershipManifest(input) {
  const manifest = parseNativeOwnershipManifest(input);
  if (!manifest) return ["ownership manifest unavailable or invalid"];
  const list = (values) => (values.length > 0 ? values.join(", ") : "(none)");
  const lines = [
    `project: ${manifest.projectRoot}`,
    `Vite / reset per file: ${list(manifest.projectDirs)} plus test entries${
      manifest.entryFiles?.length ? ` and setup files (${manifest.entryFiles.join(", ")})` : ""
    }`,
    `Node / worker resident: react-native, @react-native/* (${list(manifest.reactNativeRoots)})`,
    `Node / native transform / reset per file: ${list(manifest.nodeTransformPackages)}`,
    `worker-time transform augmentations: ${list(manifest.runtimeTransformAugmentations)}`,
    `resident if Vitest externalizes them: ${list(manifest.identityResidentPackages)}`,
    `test runtime resident if external: ${list(manifest.testRuntimeResidentPackages)}`,
  ];
  if (manifest.enforcement === "overridden-by-inline-all") {
    lines.push(
      "WARNING: server.deps.inline=true takes precedence over Node ownership; graph uniqueness is not guaranteed",
    );
  }
  return lines;
}
