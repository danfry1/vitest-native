// Worker preload (test.execArgv --import): counts what reaches Node's module system and
// filesystem, underneath every vitest-native patch. Adapted from the M0 G3 counter
// (vitest-native-planning/scripts/perf/count.mjs).
import fs from "node:fs";
import Module from "node:module";

// Owned by the preload, so the hot runtime's per-file restore of globals keeps it.
const counts = { read: 0, resolve: 0, files: 0 };
globalThis.__museumCounts = counts;
const readFileSync = fs.readFileSync;
fs.readFileSync = function (...args) {
  counts.read += 1;
  return readFileSync.apply(this, args);
};
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (...args) {
  counts.resolve += 1;
  return resolveFilename.apply(this, args);
};
