// Per test file, before the file's imports: where the counters stood.
// (Kept on the preload's object: the hot runtime restores globals a file adds.)
const g = globalThis as { __museumCounts?: { read: number; resolve: number; files: number; start?: object } };
if (g.__museumCounts) {
  g.__museumCounts.files += 1;
  g.__museumCounts.start = { read: g.__museumCounts.read, resolve: g.__museumCounts.resolve };
}
