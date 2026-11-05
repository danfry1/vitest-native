// Builds vitest-native at a git ref, for a column of STATUS.md, cached by commit SHA:
//
//   node validation/bug-museum/build-ref.mjs <ref> [--cache <dir>]
//
// prints the built package directory (<cache>/<sha>/packages/vitest-native). The ref is
// exported with `git archive` (no worktree is created), installed from its own lockfile
// (`bun install --frozen-lockfile`, from bun's cache: nothing new is downloaded when the
// lockfile's packages are cached) and built. `.museum-build.json` records the SHA, the ref
// and a hash of package.json plus dist/, which run.mjs copies into every verdict. A cache
// entry is reused only when its recorded SHA is the one the ref resolves to now and its
// files still match the recorded hash. Default cache: os.tmpdir()/vn-bug-museum-builds.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_INFO, buildInfo } from "./lib/build-info.mjs";
import { buildHash } from "./lib/hash.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../../..");

export function resolveRef(ref) {
  const result = spawnSync("git", ["-C", repo, "rev-parse", "--verify", `${ref}^{commit}`], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`cannot resolve ${ref}: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

export function buildRef(ref, cache = path.join(os.tmpdir(), "vn-bug-museum-builds")) {
  const sha = resolveRef(ref);
  const root = path.join(cache, sha);
  const pkg = path.join(root, "packages/vitest-native");
  const info = path.join(pkg, BUILD_INFO);
  const run = (command, args, cwd, what) => {
    const result = spawnSync(command, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
    if (result.status !== 0)
      throw new Error(
        `${what} failed for ${ref} (${sha}):\n${(result.stdout + result.stderr).slice(-3000)}`,
      );
  };
  if (fs.existsSync(info)) {
    const cached = buildInfo(pkg);
    if (cached.verified && cached.sha === sha) {
      // The hash covers the build (package.json, dist/), not its install, which exhibits
      // run against (lib/materialise.mjs). The cache sits in the system's temporary
      // directory, whose periodic cleaner deletes files not read for days, leaving
      // packages present but missing files (vite's dist/node/module-runner.js), which a
      // plain install does not notice. So the ref's own frozen install is redone in full,
      // from bun's cache (nothing is downloaded); dist/ is not touched.
      run(
        "bun",
        ["install", "--frozen-lockfile", "--force"],
        root,
        "bun install --frozen-lockfile --force",
      );
      return pkg;
    }
  }
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  run("sh", ["-c", `git -C '${repo}' archive '${sha}' | tar -x -C '${root}'`], root, "git archive");
  run("bun", ["install", "--frozen-lockfile"], root, "bun install --frozen-lockfile");
  run("nice", ["-n", "10", "bun", "run", "build"], pkg, "bun run build");
  fs.writeFileSync(info, `${JSON.stringify({ sha, ref, hash: buildHash(pkg) })}\n`);
  return pkg;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ref = process.argv[2];
  if (!ref) {
    console.error("usage: build-ref.mjs <ref> [--cache <dir>]");
    process.exit(2);
  }
  const index = process.argv.indexOf("--cache");
  console.log(buildRef(ref, index === -1 ? undefined : path.resolve(process.argv[index + 1])));
}
