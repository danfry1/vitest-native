// Fails when npm would rewrite package.json while publishing.
//
// npm normalizes the manifest at publish time and, when that changes anything, warns
// "npm auto-corrected some errors in your package.json when publishing" and publishes
// the corrected copy. The 0.15.0 release logged one: a bin target written "./dist/cli.mjs"
// is stored as "dist/cli.mjs", which npm 11 reports as `script name dist/cli.mjs was
// invalid and removed` (npm 10: "was cleaned"). The bin survived that time, but the same
// step deletes a bin whose target it cannot clean, and the release log is the first
// place anyone would see it. This runs the same normalization ahead of the release.
//
// A dry-run, offline publish against an unroutable registry: nothing is sent, no
// login is needed, and it finishes in about a second. `npm pack` does not normalize
// the manifest, so it cannot stand in.
//
//   node scripts/check-publish-manifest.mjs [package dir]
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Offline, this publish resolves nothing; the cooldown applies anyway, as to every script
// that runs a package manager (tests/release-age.test.ts).
import "./release-age.mjs";

/** The lines of npm's publish output that report a manifest correction. */
export function autoCorrections(output) {
  const lines = output.split(/\r?\n/);
  const start = lines.findIndex((line) => /auto-corrected/i.test(line));
  if (start === -1) return [];
  // npm prints the corrections as further "npm warn publish" lines after the notice.
  const found = [lines[start]];
  for (const line of lines.slice(start + 1)) {
    if (!/^npm warn publish /i.test(line)) break;
    found.push(line);
  }
  return found;
}

function main() {
  const dir = path.resolve(
    process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
  );
  const result = spawnSync(
    "npm",
    [
      "publish",
      "--dry-run",
      "--ignore-scripts",
      "--offline",
      "--registry",
      "http://127.0.0.1:9/",
      "--tag",
      "check",
    ],
    {
      cwd: dir,
      encoding: "utf8",
      // npm is npm.cmd on Windows, which Node runs only through a shell.
      shell: process.platform === "win32",
    },
  );
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const corrections = autoCorrections(output);
  if (corrections.length > 0) {
    console.error("✗ npm would rewrite package.json when publishing:");
    for (const line of corrections) console.error(`    ${line}`);
    console.error("  Run `npm pkg fix` in the package and commit what it changes.");
    return 1;
  }
  if (result.status !== 0) {
    console.error(output);
    console.error(`✗ npm publish --dry-run exited with code ${result.status}.`);
    return 1;
  }
  console.log("✓ npm publishes package.json as written.");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
