// Packs the package and checks that every declared entry point resolves, using
// @arethetypeswrong/cli.
//
// This lived inline in two workflows, and they drifted: the resolution rule was
// re-enabled in ci.yml while release.yml — the path that actually publishes —
// kept running with it disabled. One script, called from both, is the only way
// that stays fixed.
//
// --profile node16 drops node10 (TypeScript's pre-`exports` resolution) from the
// matrix. Every subpath fails there by construction, since this package is
// exports-only and requires Node >= 20. That noise was previously silenced with
// `--ignore-rules no-resolution`, which disables the rule for EVERY resolution
// mode — so a subpath that genuinely stopped resolving under node16 or a bundler
// was reported green. Verified by packing a build whose ./presets pointed at a
// non-existent file: the old invocation exited 0 with every entry point green,
// while this one exits 1 on "node16 (from ESM): Resolution failed".
//
// `cjs-resolves-to-esm` had the same shape of bug. Some subpaths are deliberately
// ESM-only: they depend on vitest, which throws when it is reached through
// require(), so `exports` points both conditions at the .mjs build and Node
// >= 20.19 loads it via require(esm). Ignoring the rule package-wide to excuse
// those also stopped it reporting on the subpaths that ship a real CJS build —
// a dual entry could silently lose its .cjs and nothing would say so.
//
// So the run is split. The ESM-only list is DECLARED below rather than derived from
// package.json, and that distinction is the whole point. Deriving both lists from the
// manifest looks tidier and is worthless: dropping the .cjs from a dual subpath simply
// moves it into the derived ESM-only bucket, where the rule is ignored, so the gate
// relabels the defect as intentional and stays green. Verified by doing exactly that to
// ./helpers — the derived version passed, the version below fails.
//
// Intent is declared once, here; the manifest is then checked against it in both
// directions. Making a subpath ESM-only now requires editing this list, which is a
// deliberate act visible in review.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

/** Resolve an exports node the way Node does for a given condition set. */
function resolveRuntime(node, conditions) {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return null;
  for (const [key, value] of Object.entries(node)) {
    if (key === "types") continue; // a TypeScript-only condition, never a runtime target
    if (key === "default" || conditions.includes(key)) {
      const resolved = resolveRuntime(value, conditions);
      if (resolved) return resolved;
    }
  }
  return null;
}

/**
 * Subpaths that ship no CommonJS build on purpose, with the reason. Everything not
 * listed here MUST resolve require() to a real .cjs.
 */
const INTENTIONALLY_ESM_ONLY = {
  ".": "re-exports the presets, which import vitest at module scope",
  "./setup": "imports vitest at module scope",
  "./presets": "every preset imports vitest at module scope",
  "./jest-compat/setup": "vitest-dependent runtime shim, loaded as a setup file",
  "./jest-compat/jest-globals": "vitest-dependent runtime shim, resolved as a Vite alias",
  "./jest-compat/extend-expect-noop": "vitest-dependent runtime shim, resolved as a Vite alias",
  "./rntl-matchers": "types-only entry; there is no runtime target to ship",
};

const subpaths = Object.keys(manifest.exports);
const esmOnly = subpaths.filter((s) => s in INTENTIONALLY_ESM_ONLY);
const dualCjs = subpaths.filter((s) => !(s in INTENTIONALLY_ESM_ONLY));

const problems = [];

// An excuse for a subpath that no longer exists reads as coverage while guarding
// nothing, and hides the fact that the real subpath went unchecked.
for (const declared of Object.keys(INTENTIONALLY_ESM_ONLY)) {
  if (!subpaths.includes(declared)) {
    problems.push(`"${declared}" is declared ESM-only but the manifest no longer exports it.`);
  }
}

// The direction that catches a dual subpath quietly losing its CommonJS build.
for (const subpath of dualCjs) {
  const target = resolveRuntime(manifest.exports[subpath], ["node", "require"]);
  if (!target) {
    problems.push(`"${subpath}" resolves require() to nothing, and is not declared ESM-only.`);
  } else if (!target.endsWith(".cjs")) {
    problems.push(
      `"${subpath}" resolves require() to ${target}, not a .cjs build. If that is deliberate, ` +
        `add it to INTENTIONALLY_ESM_ONLY with the reason; otherwise the CJS build is missing.`,
    );
  }
}

// And the direction that catches a stale excuse: a subpath listed as ESM-only that has
// since gained a real CJS build should be checked with the rule enforced, not ignored.
for (const subpath of esmOnly) {
  const target = resolveRuntime(manifest.exports[subpath], ["node", "require"]);
  if (target?.endsWith(".cjs")) {
    problems.push(
      `"${subpath}" ships a CJS build now — remove it from INTENTIONALLY_ESM_ONLY so the ` +
        `cjs-resolves-to-esm rule is enforced for it.`,
    );
  }
}

if (dualCjs.length === 0) {
  problems.push("no dual CJS/ESM subpath left — the enforced pass would check nothing.");
}

if (problems.length > 0) {
  console.error(`✗ export map does not match declared intent:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-check-exports-"));
const run = (command, args, options = {}) =>
  spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });

try {
  const packed = run("npm", ["pack", "--ignore-scripts", "--pack-destination", outDir]);
  if (packed.status !== 0) {
    console.error("✗ could not pack the package for the export check.");
    process.exit(1);
  }

  const [tarball] = fs.readdirSync(outDir).filter((f) => f.endsWith(".tgz"));
  if (!tarball) {
    console.error(`✗ npm pack produced no tarball in ${outDir}.`);
    process.exit(1);
  }
  const archive = path.join(outDir, tarball);

  const passes = [
    {
      label: `dual CJS/ESM subpaths (cjs-resolves-to-esm enforced): ${dualCjs.join(", ")}`,
      entrypoints: dualCjs,
      ignore: [],
    },
    {
      label: `ESM-only subpaths (cjs-resolves-to-esm ignored): ${esmOnly.join(", ")}`,
      entrypoints: esmOnly,
      ignore: ["cjs-resolves-to-esm"],
    },
  ];

  for (const pass of passes) {
    console.log(`\n=== ${pass.label} ===`);
    const checked = run("npx", [
      "--yes",
      "@arethetypeswrong/cli",
      archive,
      "--profile",
      "node16",
      "--entrypoints",
      ...pass.entrypoints,
      ...(pass.ignore.length ? ["--ignore-rules", ...pass.ignore] : []),
    ]);
    if (checked.status !== 0) process.exit(checked.status ?? 1);
  }
  console.log("\n✓ every declared subpath checked under the right CJS/ESM expectation");
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
