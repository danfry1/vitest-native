// The files the build reads to produce dist/, relative to the package root: everything
// under src/, and the build files that decide what dist/ contains (tsdown.config.ts, the
// verbatim runtime list it copies from and the static-types copy). One list, read by
// check-changeset.mjs (a change here ships to users) and build-stamp.mjs (a change here
// makes dist/ stale).
export const SOURCE_DIR = "src/";
export const BUILD_FILES = [
  "tsdown.config.ts",
  "scripts/copy-static-types.mjs",
  "scripts/verbatim-runtime.mjs",
];
