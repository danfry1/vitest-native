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

export function runDoctor(root: string, nodeVersion: string = process.versions.node): DoctorResult {
  const lines: string[] = [];
  let ok = true;
  const pass = (s: string) => lines.push(`  ✓ ${s}`);
  const warn = (s: string) => lines.push(`  ⚠ ${s}`);
  const fail = (s: string) => {
    ok = false;
    lines.push(`  ✗ ${s}`);
  };

  lines.push(`vitest-native doctor — ${root}`);

  // --- Runtime ---
  lines.push("", "Runtime");
  const nodeMajorMinor = nodeVersion.split(".").slice(0, 2).map(Number);
  if (nodeMajorMinor[0] >= 20) pass(`Node ${nodeVersion} (floor: 20)`);
  else fail(`Node ${nodeVersion} — vitest-native requires Node >= 20.`);

  // --- Required peers ---
  lines.push("", "Peer dependencies");
  for (const { name, minimum, maximumMajor, minimumByMajor, optional } of PEER_REQUIREMENTS) {
    if (optional) continue; // reported under "Testing library", and never blocking
    const error = validatePeerDependency(name, minimum, root, maximumMajor, minimumByMajor);
    if (error) fail(error);
    else pass(`${name} ${packageVersion(root, name)}`);
  }

  // --- Engine ---
  lines.push("", "Engine");
  const rnVersion = packageVersion(root, "react-native");
  const decision = detectEngine("auto", root);
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
  const rntl = packageVersion(root, "@testing-library/react-native");
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
  const expo = packageVersion(root, "expo");
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
  const configFile = findConfigFile(root);
  if (!configFile) {
    warn("no vitest.config.* found — run `vitest-native init` to create one.");
  } else {
    const content = fs.readFileSync(path.join(root, configFile), "utf8");
    const usage = analyzeConfigUsage(content);
    if (usage.imports && usage.invokes) {
      pass(`${configFile} uses vitest-native.`);
    } else if (usage.imports) {
      warn(
        `${configFile} imports vitest-native but never calls reactNative() — ` +
          "the plugin is not in `plugins: [...]`, so React Native imports will not resolve.",
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
