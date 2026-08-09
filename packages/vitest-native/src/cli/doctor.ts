/**
 * `vitest-native doctor` — diagnose the project's environment: peer versions,
 * engine resolution (and why), detected presets, RNTL/Node compatibility, and
 * config presence. Read-only; never mutates the project.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { validatePeerDependency } from "../validate.js";
import { detectEngine } from "../native/detect.js";
import { AUTO_DETECT_PRESETS } from "../preset-map.js";
import { PEER_REQUIREMENTS } from "../peer-requirements.js";

export interface DoctorResult {
  lines: string[];
  ok: boolean;
}

function packageVersion(root: string, name: string): string | null {
  try {
    const req = createRequire(path.join(root, "package.json"));
    return (req(`${name}/package.json`) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

/**
 * The supported Node floor, as [major, minor], read from this package's own
 * `engines.node`. Single source: the manifest is what a package manager enforces
 * at install time, so a diagnostic must not carry its own copy of the number.
 */
export function nodeFloor(): [number, number] {
  const fallback: [number, number] = [20, 19];
  try {
    const manifest = JSON.parse(
      fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { engines?: { node?: string } };
    const match = /(\d+)\.(\d+)/.exec(manifest.engines?.node ?? "");
    return match ? [Number(match[1]), Number(match[2])] : fallback;
  } catch {
    // Bundled layouts can put the manifest elsewhere; a stale-but-close floor is
    // better than a diagnostic that throws.
    return fallback;
  }
}

/**
 * In Vitest's own precedence order: a `vitest.config.*` wins, and `vite.config.*`
 * is used when there is none.
 *
 * The vite.config entries were missing, so a correct setup that configures Vitest
 * from vite.config.ts — normal in projects that already had Vite — was told "no
 * vitest.config.* found — run `vitest-native init`". Following that produces a
 * second config which then TAKES PRECEDENCE over the working one, so the advice
 * did not just misreport, it would have broken the project.
 */
const CONFIG_FILES = [
  "vitest.config.ts",
  "vitest.config.mts",
  "vitest.config.js",
  "vitest.config.mjs",
  "vitest.config.cts",
  "vitest.config.cjs",
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cts",
  "vite.config.cjs",
];

function findConfigFile(root: string): string | null {
  for (const name of CONFIG_FILES) {
    if (fs.existsSync(path.join(root, name))) return name;
  }
  return null;
}

/** Source with comments removed, so a mention inside one cannot be mistaken for use. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Whether a config is built on one imported from elsewhere — a shared preset in a
 * workspace, typically. Such a file legitimately never mentions vitest-native, and
 * reporting it as unconfigured is a false alarm on a working project.
 */
export function extendsSharedConfig(source: string): boolean {
  const code = withoutComments(source);
  // A bare-specifier import (not "./x"), whose binding is then exported or merged.
  const imports = [...code.matchAll(/import\s+([^;]+?)\s+from\s*["']([^"'.][^"']*)["']/g)];
  for (const [, clause, specifier] of imports) {
    // Vitest's own helpers are not a shared config being extended. Nothing else
    // needs excluding: the checks below require the binding to BE the exported
    // config, so an ordinary helper import never qualifies.
    if (specifier === "vitest" || specifier.startsWith("vitest/")) continue;
    const bindings = [...clause.matchAll(/([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    for (const binding of bindings) {
      if (binding === "defineConfig" || binding === "default") continue;
      // The binding has to BE the exported config, or the base being merged into it —
      // merely appearing on the export line is any ordinary helper call.
      if (new RegExp(`export\\s+default\\s+${binding}\\s*;?\\s*$`, "m").test(code)) return true;
      if (new RegExp(`\\bmergeConfig\\s*\\(\\s*${binding}\\b`).test(code)) return true;
    }
  }
  return false;
}

export interface ConfigUsage {
  /** The config imports vitest-native (not merely mentions it). */
  imports: boolean;
  /** The imported plugin factory is actually called. */
  invokes: boolean;
}

/**
 * Whether a config genuinely uses the plugin.
 *
 * This was a substring test — `content.includes("vitest-native")` — so a config
 * whose only mention was a `// TODO: migrate to vitest-native` comment reported
 * "uses vitest-native" and "No blocking problems found", on a project where every
 * React Native import would fail. Diagnosing that is the entire job of this
 * command.
 *
 * The binding name is read from the import rather than assumed, so an aliased
 * import still counts as used; when the import shape is not one of the forms
 * below, the import alone is accepted rather than risking a false alarm on a
 * working project.
 */
export function analyzeConfigUsage(source: string): ConfigUsage {
  const code = withoutComments(source);
  const named = /import\s*\{([^}]*)\}\s*from\s*["']vitest-native["']/.exec(code);
  const namespaced = /import\s*\*\s*as\s*([A-Za-z_$][\w$]*)\s*from\s*["']vitest-native["']/.exec(
    code,
  );
  const required =
    /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*["']vitest-native["']\s*\)/.exec(code);

  const bindingFrom = (clause: string): string | null => {
    const entry = /\breactNative\b(?:\s*(?::|as)\s*([A-Za-z_$][\w$]*))?/.exec(clause);
    return entry ? (entry[1] ?? "reactNative") : null;
  };

  if (named || required) {
    const binding = bindingFrom((named ?? required)![1]);
    // Imported something else from the package (helpers, presets) — not our call
    // to judge; treat the import as use.
    if (!binding) return { imports: true, invokes: true };
    return { imports: true, invokes: new RegExp(`\\b${binding}\\s*\\(`).test(code) };
  }
  if (namespaced) {
    return { imports: true, invokes: new RegExp(`\\b${namespaced[1]}\\.\\w+\\s*\\(`).test(code) };
  }
  // Any other import form (side-effect, dynamic) still counts as importing.
  if (/from\s*["']vitest-native["']|require\(\s*["']vitest-native["']\s*\)/.test(code)) {
    return { imports: true, invokes: true };
  }
  return { imports: false, invokes: false };
}

/**
 * The directory a test run would actually resolve from.
 *
 * `doctor` resolved peers from its own working directory. In a workspace that is
 * frequently not where the Vitest config lives, and under pnpm a package's
 * node_modules holds only its DECLARED dependencies — so a hoisted
 * `@react-native/babel-preset` does not resolve from the package even though the
 * real run finds it. The result was `doctor` reporting "engine 'auto' resolves to
 * MOCK" for a project whose run banner said native.
 *
 * This is a FALLBACK, not a replacement. Node resolution walks upward, so the
 * directory the command was invoked in already sees its own dependencies AND
 * everything declared above it — resolving from higher up can only see less. Using
 * the config root unconditionally lost dependencies a package declared itself, and
 * reported a missing peer for a project that had one: the inverse of the bug this
 * was written for.
 *
 * So the invocation directory is tried first, and this is consulted only when
 * something fails to resolve there — which is the case where the command was run
 * above the package that declares it.
 */
export function resolutionRoot(start: string, exists = fs.existsSync): string {
  let dir = start;
  for (;;) {
    // A config only counts where there is also a manifest — that is a project root.
    // Intermediate directories like `packages/` have neither and are walked through;
    // a stray config somewhere above the checkout has no manifest beside it and is
    // ignored, which is what stopped a fixture under the system temp directory from
    // resolving against whatever happened to sit above it.
    if (
      CONFIG_FILES.some((name) => exists(path.join(dir, name))) &&
      exists(path.join(dir, "package.json"))
    ) {
      return dir;
    }
    if (exists(path.join(dir, ".git"))) return start;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

export function runDoctor(root: string, nodeVersion: string = process.versions.node): DoctorResult {
  const lines: string[] = [];
  let ok = true;
  const pass = (s: string) => lines.push(`  ✓ ${s}`);
  const warn = (s: string) => lines.push(`  ⚠ ${s}`);
  const fail = (s: string) => {
    ok = false;
    lines.push(`  ✗ ${s}`);
  };

  // Resolve from where the command was invoked, which sees the most; fall back to
  // the directory holding the Vitest config when something is not visible there.
  const configRoot = resolutionRoot(root);
  const resolvesHere = (name: string): boolean => packageVersion(root, name) !== null;
  const rootFor = (name: string): string =>
    resolvesHere(name) || configRoot === root ? root : configRoot;
  lines.push(`vitest-native doctor — ${root}`);

  // --- Runtime ---
  lines.push("", "Runtime");
  const nodeMajorMinor = nodeVersion.split(".").slice(0, 2).map(Number);
  // The floor is read from this package's own `engines.node` rather than written
  // out here. It was hardcoded as 20, and compared on the MAJOR only, so when the
  // real floor moved to 20.19 — the version that added require(esm), which the
  // root entry point now depends on — doctor kept passing Node 20.0 and kept
  // printing "floor: 20". A number a user reads off a diagnostic has to come from
  // the same place the runtime enforces it.
  const [floorMajor, floorMinor] = nodeFloor();
  const floorText = `${floorMajor}.${floorMinor}`;
  if (
    nodeMajorMinor[0] > floorMajor ||
    (nodeMajorMinor[0] === floorMajor && nodeMajorMinor[1] >= floorMinor)
  ) {
    pass(`Node ${nodeVersion} (floor: ${floorText})`);
  } else {
    fail(`Node ${nodeVersion} — vitest-native requires Node >= ${floorText}.`);
  }

  // --- Required peers ---
  lines.push("", "Peer dependencies");
  for (const { name, minimum, maximumMajor, minimumByMajor, optional } of PEER_REQUIREMENTS) {
    if (optional) continue; // reported under "Testing library", and never blocking
    const from = rootFor(name);
    const error = validatePeerDependency(name, minimum, from, maximumMajor, minimumByMajor);
    if (error) fail(error);
    else {
      pass(`${name} ${packageVersion(from, name)}`);
      if (from !== root) lines.push(`      (resolved from ${from}, not from here)`);
    }
  }

  // --- Engine ---
  lines.push("", "Engine");
  const rnVersion = packageVersion(rootFor("react-native"), "react-native");
  const decision = detectEngine("auto", rootFor("@react-native/babel-preset"));
  if (decision.engine === "native") {
    pass(
      `engine 'auto' resolves to NATIVE — real React Native${rnVersion ? ` ${rnVersion}` : ""} with @react-native/babel-preset + @babel/core present.`,
    );
  } else if (rnVersion) {
    warn(
      `engine 'auto' resolves to MOCK: react-native ${rnVersion} is installed but ` +
        `@react-native/babel-preset and/or @babel/core do not resolve. Install both ` +
        `as devDependencies to run the real-RN native engine.`,
    );
  } else {
    warn(
      `engine 'auto' resolves to MOCK: react-native is not installed. ` +
        `That is fine for pure-logic suites; install react-native (+ its babel preset) for the native engine.`,
    );
  }

  // --- RNTL ---
  lines.push("", "Testing library");
  const rntl = packageVersion(
    rootFor("@testing-library/react-native"),
    "@testing-library/react-native",
  );
  if (!rntl) {
    warn(
      "@testing-library/react-native not found — optional, but required for render()/screen queries.",
    );
  } else {
    const rntlMajor = Number(rntl.split(".")[0]);
    // WARN, not fail, and the range comes from PEER_REQUIREMENTS rather than being
    // written out again here. The plugin only console.warns for a version outside
    // the supported range — an optional peer does not stop a run — so failing here
    // reported "blocking problems found", and a non-zero exit, for a project that
    // works. The range itself lived in three unpinned places: this comparison, the
    // plugin's startup check, and the published peerDependencies entry.
    const rntlReq = PEER_REQUIREMENTS.find((r) => r.name === "@testing-library/react-native");
    const rntlError =
      rntlReq &&
      validatePeerDependency(
        rntlReq.name,
        rntlReq.minimum,
        root,
        rntlReq.maximumMajor,
        rntlReq.minimumByMajor,
      );
    if (rntlError) {
      warn(rntlError);
    } else if (
      rntlMajor >= 14 &&
      (nodeMajorMinor[0] < 22 || (nodeMajorMinor[0] === 22 && nodeMajorMinor[1] < 13))
    ) {
      fail(
        `@testing-library/react-native ${rntl} requires Node >= 22.13, but this is Node ${nodeVersion}. ` +
          `Upgrade Node or pin @testing-library/react-native@13.`,
      );
    } else if (rntlMajor >= 14 && !packageVersion(rootFor("test-renderer"), "test-renderer")) {
      // RNTL 14 declares `test-renderer` as a NON-optional peer and reconciles
      // through it. Without it every render throws "Cannot find module
      // 'test-renderer'" — no file, no package, nothing pointing at the cause —
      // while doctor reported no blocking problems. Installing RNTL 14 without its
      // peer is easy: npm only warns, and any `--legacy-peer-deps` install is
      // silent. This is blocking rather than a warning: RNTL itself is optional,
      // but once RNTL 14 is present every render() in the project fails.
      fail(
        `@testing-library/react-native ${rntl} requires the 'test-renderer' package, which is not installed. ` +
          `Every render() will fail with "Cannot find module 'test-renderer'". ` +
          `Install it:\n\n  npm install -D test-renderer\n`,
      );
    } else {
      pass(
        `@testing-library/react-native ${rntl}${rntlMajor >= 14 ? " (14 is async: await render/fireEvent)" : ""}`,
      );
    }
  }

  // --- Presets ---
  lines.push("", "Auto-detected presets");
  const req = createRequire(path.join(root, "package.json"));
  const detected: string[] = [];
  for (const [pkg, preset] of Object.entries(AUTO_DETECT_PRESETS)) {
    try {
      req.resolve(pkg);
      detected.push(`${pkg} → ${preset}`);
    } catch {
      // not installed
    }
  }
  if (detected.length) for (const d of detected) pass(d);
  else lines.push("  (none — no preset-covered packages installed)");

  // --- Expo ---
  const expo = packageVersion(rootFor("expo"), "expo");
  if (expo) {
    lines.push("", "Expo");
    warn(
      `expo ${expo} detected. Expo-module components work via the auto-detected preset; ` +
        `suites that import Expo CORE internals (expo-router setups, dev-client wiring) can hit ` +
        `known limits — see the Jest migration guide's Expo notes.`,
    );
  }

  // --- Config ---
  lines.push("", "Config");
  const configFile = findConfigFile(configRoot);
  if (!configFile) {
    warn("no vitest.config.* found — run `vitest-native init` to create one.");
  } else {
    const content = fs.readFileSync(path.join(configRoot, configFile), "utf8");
    const usage = analyzeConfigUsage(content);
    if (usage.imports && usage.invokes) {
      pass(`${configFile} uses vitest-native.`);
    } else if (usage.imports) {
      warn(
        `${configFile} imports vitest-native but never calls reactNative() — ` +
          "the plugin is not in `plugins: [...]`, so React Native imports will not resolve.",
      );
    } else if (extendsSharedConfig(content)) {
      // A workspace config that re-exports a shared preset cannot be judged from
      // this file: the plugin is wired up in the package it imports. Saying it does
      // not reference vitest-native is simply wrong, and was reported as a false
      // positive from a monorepo doing exactly this.
      lines.push(
        `  · ${configFile} builds on a shared config, so this cannot tell from here ` +
          "whether the plugin is wired up. Check the config it extends.",
      );
    } else {
      warn(
        `${configFile} exists but does not import vitest-native` +
          (content.includes("vitest-native") ? " (it is only mentioned in a comment)" : "") +
          " — add `reactNative()` to `plugins: [...]`, or run `vitest-native init`.",
      );
    }
  }

  lines.push("", ok ? "✓ No blocking problems found." : "✗ Blocking problems found (see ✗ above).");
  return { lines, ok };
}
