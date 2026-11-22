// Installs a command-line tool globally from its registry tarball, after checking it
// against the integrity the registry published for that release, so a job runs exactly
// that release. `npm install -g <name>@<version>` resolves through the registry at run
// time, which OpenSSF Scorecard reports as an unpinned dependency, and nothing checks
// what arrives. Only tools that need nothing else from the registry are listed: npm
// bundles its dependencies in its tarball, and corepack has none. Every workflow installs
// global tools through here (packages/vitest-native/tests/workflow-global-installs.test.ts).
//
//   node .github/scripts/install-global.mjs <name> <version>
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** The releases jobs install, with the integrity the registry publishes for each. */
export const INTEGRITY = {
  // Staged publishing (`npm stage`) needs 11.15 or later: the release workflow.
  "npm@11.15.0":
    "sha512-+k0tk7lRnpMUPnC7kTuU/yrV/mnFoPhJQ75VfLtZ6fwbzOVXaPsTE/Il9Pn1DHi482byMyqkHv/XsQ76mNjXLw==",
  // The first without the arborist edgesOut crash in the packed consumer installs.
  "npm@11.20.0":
    "sha512-dF3EDFwbYN+N5RUip+ZYDe0NeURK5BgqKOcvT1iNtUYhTMTl0FwWhBuXrS7KtXyduqyTMS5aaQaregnHDAxNgw==",
  // Current package-manager signing keys (the bake-off ratchet).
  "corepack@0.35.0":
    "sha512-9BuIGHDFE7Zieor1CeRsvt7X7AJFEuJ6OnbSbsVprq83ChDFoBh1wP98NeUS9FT3ZwlzFllPElXcz/OiDf0YGw==",
};

/** The `sha512-…` integrity of `bytes`, as the registry writes it. */
export function integrityOf(bytes) {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

async function main(name, version) {
  const spec = `${name}@${version}`;
  const expected = INTEGRITY[spec];
  if (!expected) {
    throw new Error(
      `${spec} has no recorded integrity: add it to INTEGRITY (npm view ${spec} dist.integrity).`,
    );
  }
  const url = `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = integrityOf(bytes);
  if (actual !== expected) {
    throw new Error(`${name}-${version}.tgz does not match its published integrity (${actual}).`);
  }
  const dir = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), `${name}-`));
  const tarball = path.join(dir, `${name}-${version}.tgz`);
  fs.writeFileSync(tarball, bytes);
  const run = (args) => {
    // npm is npm.cmd on Windows, which only a shell can start.
    const result = spawnSync("npm", args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) throw new Error(`npm ${args.join(" ")} exited with ${result.status}`);
  };
  run(["install", "-g", tarball, "--ignore-scripts", "--no-audit", "--no-fund"]);
  console.log(`${spec} installed, integrity checked.`);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  await main(process.argv[2], process.argv[3]);
}
