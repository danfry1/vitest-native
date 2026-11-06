// Installs the identity-probe packages into this package's node_modules for the run,
// and removes them after: Vite resolves a test file's imports from its own directory,
// so a package the probes import has to be where an installed one would be.
// VN_OWNERSHIP_LAYOUT=pnpm places vn-ownership-dual the way pnpm does: the real
// directory under node_modules/.pnpm, with a peer in its name, and a symlink to it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const modules = path.resolve(here, "../../node_modules");
const PNPM_DIR = ".pnpm/vn-ownership-dual@1.0.0_react-native-worklets@0.13.0/node_modules";
const placed = [
  path.join(modules, "vn-ownership-dual"),
  path.join(modules, "vn-nested-reader"),
  path.join(modules, ".pnpm/vn-ownership-dual@1.0.0_react-native-worklets@0.13.0"),
];

function remove() {
  for (const target of placed) fs.rmSync(target, { recursive: true, force: true });
}

export function setup() {
  remove();
  const dual = path.join(here, "fixtures/vn-ownership-dual");
  if (process.env.VN_OWNERSHIP_LAYOUT === "pnpm") {
    const real = path.join(modules, PNPM_DIR, "vn-ownership-dual");
    fs.cpSync(dual, real, { recursive: true });
    fs.symlinkSync(real, path.join(modules, "vn-ownership-dual"), "junction");
  } else {
    fs.cpSync(dual, path.join(modules, "vn-ownership-dual"), { recursive: true });
  }
  const reader = path.join(modules, "vn-nested-reader");
  fs.cpSync(path.join(here, "fixtures/vn-nested-reader"), reader, { recursive: true });
  fs.renameSync(path.join(reader, "node_modules-src"), path.join(reader, "node_modules"));
}

export function teardown() {
  remove();
}
