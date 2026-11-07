// Installs the identity-probe packages into this package's node_modules for the run: Vite
// resolves a test file's imports from its own directory, so a package the probes import
// has to be where an installed one would be.
//
// The ownership suite runs as several scripts at once (test:native:ownership:*), each
// with this setup, so the packages are placed the concurrency-safe way
// (support/installed-fixture.ts): built once from the current fixtures, renamed into
// place, never removed by a run that another run may still be using.
//
// VN_OWNERSHIP_LAYOUT=pnpm places vn-ownership-dual the way pnpm does: the real directory
// under node_modules/.pnpm, with a peer in its name, and a symlink to it. It is a manual,
// one-run-at-a-time check: it replaces the packages and removes them afterwards.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { place } from "../support/installed-fixture";

const here = path.dirname(fileURLToPath(import.meta.url));
const modules = path.resolve(here, "../../node_modules");
const PNPM_DIR = ".pnpm/vn-ownership-dual@1.0.0_react-native-worklets@0.13.0/node_modules";
const DUAL = path.join(here, "fixtures/vn-ownership-dual");
const READER = path.join(here, "fixtures/vn-nested-reader");
const pnpm = process.env.VN_OWNERSHIP_LAYOUT === "pnpm";
const placed = [
  path.join(modules, "vn-ownership-dual"),
  path.join(modules, "vn-nested-reader"),
  path.join(modules, ".pnpm/vn-ownership-dual@1.0.0_react-native-worklets@0.13.0"),
];

function remove() {
  for (const target of placed) fs.rmSync(target, { recursive: true, force: true });
}

/** vn-nested-reader ships its own node_modules, kept as node_modules-src in the fixture. */
function buildReader(dir: string) {
  fs.cpSync(READER, dir, { recursive: true });
  fs.renameSync(path.join(dir, "node_modules-src"), path.join(dir, "node_modules"));
}

export function setup() {
  if (pnpm) {
    remove();
    const real = path.join(modules, PNPM_DIR, "vn-ownership-dual");
    fs.cpSync(DUAL, real, { recursive: true });
    fs.symlinkSync(real, path.join(modules, "vn-ownership-dual"), "junction");
    buildReader(path.join(modules, "vn-nested-reader"));
    return;
  }
  place("vn-ownership-dual", [DUAL], (dir) => fs.cpSync(DUAL, dir, { recursive: true }));
  place("vn-nested-reader", [READER], buildReader);
}

export function teardown() {
  if (pnpm) remove();
}
