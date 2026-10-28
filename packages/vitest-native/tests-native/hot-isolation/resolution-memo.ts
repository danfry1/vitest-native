import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { threadId } from "node:worker_threads";
import { expect, vi } from "vitest";

// Shared by 14/15: what a library re-loaded by every test file costs once it has
// been loaded before in the same worker. Node does not cache a resolution that goes
// through a package's `exports` map, and the hot reset drops the module, so without
// the engine's resolution memo (hooks.mjs) every such require is resolved again by
// Node on every file. The memo's counters are the observable:
//   globalThis[Symbol.for("vitest-native.resolutionMemo")] = { hits, misses }
// `misses` counts bare-specifier resolutions that reached Node, `hits` those the memo
// answered.
type MemoStats = { hits: number; misses: number };
const memoStats = () =>
  (globalThis as Record<symbol, MemoStats | undefined>)[Symbol.for("vitest-native.resolutionMemo")];

const here = path.dirname(fileURLToPath(import.meta.url));
// One requiring directory for both files: the memo is keyed by it, as Node keys its
// own relativeResolveCache.
const req = createRequire(path.join(here, "resolution-memo.fixture.cjs"));
const FIXTURE_TS = path.join(here, "resolution-memo-fixture.ts");

// Which of the pair runs first varies (see 01-first.test.ts), so the first one leaves
// a marker for its worker and the second asserts against it.
const marker = path.join(os.tmpdir(), `vn-resolution-memo-${process.pid}-${threadId}`);

export function loadTwiceAcrossFiles() {
  const otherFileRan = fs.existsSync(marker);
  const stats = memoStats();
  expect(stats, "the resolution memo's counters are published").toBeDefined();
  const before = { ...stats! };
  const read = vi.spyOn(fs, "readFileSync");
  let lib: { entry: string };
  let ts: { value: string };
  let sourceReads: number;
  try {
    lib = req("rn-condition-lib");
    ts = req(FIXTURE_TS);
    // Counted before mockRestore, which clears the recorded calls.
    sourceReads = read.mock.calls.filter(([file]) => String(file) === FIXTURE_TS).length;
  } finally {
    read.mockRestore();
  }
  const delta = { hits: stats!.hits - before.hits, misses: stats!.misses - before.misses };

  // Whatever answered, the answer is Node's: the "react-native" export condition.
  expect(lib.entry).toBe("native");
  expect(ts.value).toBe("fixture");

  if (otherFileRan) {
    fs.rmSync(marker, { force: true });
    // Loaded by the previous file, dropped by the reset, loaded again here.
    expect(delta, "the package's resolution is not repeated by Node").toMatchObject({
      misses: 0,
    });
    expect(delta.hits).toBeGreaterThanOrEqual(1);
    expect(sourceReads, "an unchanged compiled source is not read again").toBe(0);
  } else {
    fs.writeFileSync(marker, "");
  }
}
