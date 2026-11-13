import "./release-age.mjs";
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  BUN_RELEASE_AGE_SECONDS,
  bunfigWithReleaseAge,
  bunReleaseAgeFlag,
} from "./release-age.mjs";

/**
 * Install a throwaway fixture (a reproduction app, an older library version) outside the
 * repository without letting it pull young or unvetted transitive packages.
 *
 *   node scripts/scratch-install.mjs <dir>
 *
 * A scratch directory has no lockfile, and bun reads bunfig.toml from the project it
 * installs, so the repository's release cooldown did not reach it: one such install
 * resolved vite, rolldown, flow-parser, caniuse-lite and five more at 1–4 days old. Here:
 *
 * 1. The top level must be exact versions (or a `file:` tarball): approvals name versions.
 * 2. The tree is resolved (lockfile only) with the cooldown, then every package that
 *    resolved away from the repository's single version is overridden to it, where that
 *    version satisfies every range the scratch tree asks for. An unconditional override
 *    would force, say, the repository's `@react-native/*` onto an older React Native that
 *    depends on its own exact release. The tree is resolved again until no new override
 *    applies (an overridden vite asks for the repository's rolldown, and so on).
 * 3. Every package the repository's lockfile does not have is checked against the
 *    registry's publish time; one younger than the cooldown stops the install. So does one
 *    resolved from git, a URL or a local path, which has no publish time, other than the
 *    top level's own `file:` tarball.
 * 4. The install is frozen, with install scripts off, and the cooldown is also written to
 *    `<dir>/bunfig.toml` so a later `bun install` there keeps it.
 *
 * It decides nothing about what may be installed: the approval still comes first. The
 * report lists the packages new to this machine, for the run's provenance.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"];
const RANGE_FIELDS = [...DEPENDENCY_FIELDS, "peerDependencies"];

/** bun.lock is JSON with trailing commas. */
export function parseBunLock(text) {
  return JSON.parse(text.replace(/,(\s*[}\]])/g, "$1"));
}

/** The top-level entries that are not an exact version or a `file:` tarball. */
export function rangedTopLevel(manifest) {
  const problems = [];
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (!EXACT.test(spec) && !spec.startsWith("file:")) problems.push(`${name}@${spec}`);
    }
  }
  return problems;
}

/** A lockfile id's name and what it resolved to: a version, or a git, URL or file spec. */
function splitId(id) {
  // The first "@" after a scope: a git URL can hold another (git@github.com).
  const at = id.indexOf("@", 1);
  return at <= 0 ? null : { name: id.slice(0, at), spec: id.slice(at + 1) };
}

/** Every registry package a lockfile resolves: name → its versions. */
export function lockedVersions(lock) {
  const versions = new Map();
  for (const entry of Object.values(lock.packages ?? {})) {
    const split = splitId(entry[0]);
    if (!split) continue;
    const { name, spec: version } = split;
    if (!EXACT.test(version)) continue; // a workspace, link, git or tarball
    if (!versions.has(name)) versions.set(name, new Set());
    versions.get(name).add(version);
  }
  return versions;
}

/** Every range a lockfile's tree asks for: name → its ranges. */
export function requestedRanges(lock) {
  const ranges = new Map();
  const add = (deps) => {
    for (const [name, range] of Object.entries(deps ?? {})) {
      if (!ranges.has(name)) ranges.set(name, new Set());
      ranges.get(name).add(range);
    }
  };
  for (const workspace of Object.values(lock.workspaces ?? {})) {
    for (const field of RANGE_FIELDS) add(workspace[field]);
  }
  for (const entry of Object.values(lock.packages ?? {})) {
    const meta = entry.find((part) => part && typeof part === "object" && !Array.isArray(part));
    for (const field of RANGE_FIELDS) add(meta?.[field]);
  }
  return ranges;
}

/**
 * The repository's version for each scratch package it resolves to exactly one version,
 * where that version satisfies every range the scratch tree requests. The top level is
 * the approval's, so it is never overridden.
 */
export function chooseOverrides({ repoLock, scratchLock, topLevel, satisfies }) {
  const repo = lockedVersions(repoLock);
  const ranges = requestedRanges(scratchLock);
  const candidates = [];
  for (const [name, resolved] of lockedVersions(scratchLock)) {
    if (topLevel.has(name)) continue;
    const repoVersions = repo.get(name);
    if (repoVersions?.size !== 1) continue;
    const [version] = repoVersions;
    if (resolved.size === 1 && resolved.has(version)) continue; // already the repository's
    candidates.push({ name, version, wanted: [...(ranges.get(name) ?? [])] });
  }
  const pairs = candidates.flatMap(({ version, wanted }) => wanted.map((r) => [version, r]));
  const verdicts = satisfies(pairs);
  let start = 0;
  const overrides = {};
  for (const { name, version, wanted } of candidates) {
    // Slice, not every() with a running index: every() stops at the first false and
    // would misalign the verdicts of every candidate after it.
    const own = verdicts.slice(start, (start += wanted.length));
    if (own.every(Boolean)) overrides[name] = version;
  }
  return overrides;
}

/**
 * Every scratch package resolved from somewhere other than the registry (git, a tarball
 * URL, a local path). Those have no publish time, so the age check cannot see them. The
 * one exception is a top-level dependency on a tarball the caller names in `tarballs`
 * (the package this repository packs), matched by its resolved path; bun's lock records
 * it as `name@<path>`, without the manifest's `file:`.
 */
export function nonRegistryPackages(scratchLock, { manifest, dir, tarballs = [] }) {
  const topLevel = new Set(
    DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] ?? {})),
  );
  const own = new Set(tarballs.map((file) => path.resolve(file)));
  const found = [];
  for (const [key, entry] of Object.entries(scratchLock.packages ?? {})) {
    const split = splitId(entry[0]);
    if (split && EXACT.test(split.spec)) continue;
    // The top level's own entry is keyed by its bare name; a nested copy (`parent/name`) is not.
    if (
      split &&
      topLevel.has(key) &&
      own.has(path.resolve(dir, split.spec.replace(/^file:/, "")))
    ) {
      continue;
    }
    found.push(entry[0]);
  }
  return found.sort();
}

/** `name@version` for every scratch package the repository's lockfile does not have. */
export function newPackages(repoLock, scratchLock) {
  const repo = lockedVersions(repoLock);
  const fresh = [];
  for (const [name, versions] of lockedVersions(scratchLock)) {
    for (const version of versions) {
      if (!repo.get(name)?.has(version)) fresh.push({ name, version });
    }
  }
  return fresh.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/** Resolutions with overrides before giving up; each round only adds overrides. */
const MAX_ROUNDS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
const days = (ms) => `${(ms / DAY_MS).toFixed(1)} d`;

/** Bun's own semver, one process for every pair. */
function bunSatisfies(pairs) {
  if (pairs.length === 0) return [];
  const source =
    "const p=JSON.parse(require('fs').readFileSync(0,'utf8'));" +
    "console.log(JSON.stringify(p.map(([v,r])=>{try{return Bun.semver.satisfies(v,r)}catch{return false}})))";
  return JSON.parse(
    execFileSync("bun", ["-e", source], { input: JSON.stringify(pairs), encoding: "utf8" }),
  );
}

/** The registry's publish time for one version (a read; nothing is installed). */
async function registryPublishTime(name, version) {
  const { stdout } = await promisify(execFile)("npm", ["view", name, "time", "--json"], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const time = JSON.parse(stdout)[version];
  if (!time) throw new Error(`the registry has no publish time for ${name}@${version}`);
  return Date.parse(time);
}

/** Registry reads at once: a React Native tree has a few hundred packages to look up. */
const LOOKUPS = 8;

function runCommand(command, args, cwd) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

export async function scratchInstall(dir, options = {}) {
  const {
    exec = runCommand,
    satisfies = bunSatisfies,
    publishTime = registryPublishTime,
    now = Date.now(),
    repoLockText = fs.readFileSync(path.join(repoRoot, "bun.lock"), "utf8"),
    log = console.log,
    tarballs = [],
  } = options;
  const manifestPath = path.join(dir, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const ranged = rangedTopLevel(manifest);
  if (ranged.length > 0) {
    throw new Error(
      `scratch-install: the top level must be exact versions (approvals name versions): ${ranged.join(", ")}`,
    );
  }
  const topLevel = new Set(DEPENDENCY_FIELDS.flatMap((f) => Object.keys(manifest[f] ?? {})));
  const repoLock = parseBunLock(repoLockText);
  const bun = (...args) =>
    exec("bun", ["install", ...args, "--ignore-scripts", bunReleaseAgeFlag()], dir);
  const readLock = () => parseBunLock(fs.readFileSync(path.join(dir, "bun.lock"), "utf8"));
  const writeManifest = () =>
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  fs.writeFileSync(path.join(dir, "bunfig.toml"), bunfigWithReleaseAge());
  // A rerun starts from the approval alone, not from an earlier run's overrides or lock.
  delete manifest.overrides;
  writeManifest();
  fs.rmSync(path.join(dir, "bun.lock"), { force: true });

  bun("--lockfile-only");
  const overrides = {};
  for (let round = 1; ; round++) {
    const more = chooseOverrides({ repoLock, scratchLock: readLock(), topLevel, satisfies });
    if (Object.keys(more).length === 0) break;
    if (round > MAX_ROUNDS) {
      throw new Error(
        `scratch-install: overrides did not settle after ${MAX_ROUNDS} rounds: ${Object.keys(more).join(", ")}`,
      );
    }
    Object.assign(overrides, more);
    manifest.overrides = overrides;
    writeManifest();
    bun("--lockfile-only");
  }
  const scratchLock = readLock();
  const unvetted = nonRegistryPackages(scratchLock, { manifest, dir, tarballs });
  if (unvetted.length > 0) {
    throw new Error(
      `scratch-install: not from the registry, so their age cannot be checked: ${unvetted.join(", ")}`,
    );
  }
  const resolved = lockedVersions(scratchLock);
  const ignored = Object.entries(overrides).filter(
    ([name, version]) => resolved.has(name) && [...resolved.get(name)].some((v) => v !== version),
  );
  if (ignored.length > 0) {
    throw new Error(
      `scratch-install: bun did not apply these overrides: ${ignored.map(([n, v]) => `${n}@${v}`).join(", ")}`,
    );
  }

  const fresh = newPackages(repoLock, scratchLock);
  const floor = BUN_RELEASE_AGE_SECONDS * 1000;
  const aged = [];
  for (let i = 0; i < fresh.length; i += LOOKUPS) {
    const batch = fresh.slice(i, i + LOOKUPS);
    const times = await Promise.all(batch.map((pkg) => publishTime(pkg.name, pkg.version)));
    batch.forEach((pkg, k) => aged.push({ ...pkg, age: now - times[k] }));
  }
  const young = aged.filter(({ age }) => age < floor);
  if (young.length > 0) {
    throw new Error(
      `scratch-install: younger than the ${days(floor)} release cooldown: ${young
        .map(({ name, version, age }) => `${name}@${version} (${days(age)})`)
        .join(", ")}`,
    );
  }

  bun("--frozen-lockfile");
  const fromRepo = [...resolved.keys()].filter((name) => !fresh.some((p) => p.name === name));
  log(`\nscratch-install: ${dir}`);
  log(
    `  top level: ${[...topLevel].map((n) => `${n}@${manifest.dependencies?.[n] ?? manifest.devDependencies?.[n] ?? manifest.optionalDependencies?.[n]}`).join(", ")}`,
  );
  log(
    `  ${fromRepo.length} package(s) at the repository's resolution (${Object.keys(overrides).length} by override)`,
  );
  log(`  ${aged.length} package(s) new to this machine relative to the repository's lockfile:`);
  for (const { name, version, age } of aged) log(`    ${name}@${version} (${days(age)})`);
  return { overrides, fresh: aged };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node scripts/scratch-install.mjs <dir>");
    process.exit(2);
  }
  scratchInstall(path.resolve(dir)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
