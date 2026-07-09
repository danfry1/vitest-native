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

function findConfigFile(root: string): string | null {
  for (const name of [
    "vitest.config.ts",
    "vitest.config.mts",
    "vitest.config.js",
    "vitest.config.mjs",
    "vitest.config.cts",
    "vitest.config.cjs",
  ]) {
    if (fs.existsSync(path.join(root, name))) return name;
  }
  return null;
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
  for (const { name, minimum, maximumMajor, minimumByMajor } of PEER_REQUIREMENTS) {
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
    if (rntlMajor < 12 || rntlMajor >= 15) {
      fail(`@testing-library/react-native ${rntl} — supported range is >=12 <15.`);
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
    if (content.includes("vitest-native") || content.includes("reactNative(")) {
      pass(`${configFile} uses vitest-native.`);
    } else {
      warn(`${configFile} exists but does not reference vitest-native.`);
    }
  }

  lines.push("", ok ? "✓ No blocking problems found." : "✗ Blocking problems found (see ✗ above).");
  return { lines, ok };
}
