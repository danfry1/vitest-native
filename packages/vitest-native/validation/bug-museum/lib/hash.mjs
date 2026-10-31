// Content hashes for provenance: what a verdict was measured on, beyond a commit SHA.
//
//   buildHash(pkg)        package.json plus every file under dist/. build-ref.mjs records
//                         it, and buildInfo recomputes it, so a build edited after it was
//                         built (or a cached one edited since) is unverified.
//   exhibitHash(root, e)  the exhibit's own files plus its exhibits.json entry (less the
//                         `status` that status.mjs writes), so a verdict measured before an
//                         exhibit was rewritten no longer counts for it.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function hashFiles(base, files, extra = "") {
  const hash = crypto.createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(path.relative(base, file).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  hash.update(extra);
  return hash.digest("hex");
}

export function buildHash(pkg) {
  return hashFiles(pkg, [path.join(pkg, "package.json"), ...filesUnder(path.join(pkg, "dist"))]);
}

export function exhibitHash(museumRoot, exhibit) {
  const dir = path.join(museumRoot, "exhibits", exhibit.id);
  const { status: _status, ...definition } = exhibit;
  const files = filesUnder(dir).filter((file) => !file.split(path.sep).includes("node_modules"));
  return hashFiles(dir, files, JSON.stringify(definition));
}
