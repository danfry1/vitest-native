import fs from "node:fs";
import Module, { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { threadId } from "node:worker_threads";
import { expect, vi } from "vitest";

// Shared by 14/15: a library the previous test file loaded, dropped by the hot reset
// and loaded again, is neither resolved by Node nor read again. Node does not cache a
// resolution that goes through a package's `exports` map, so without the engine's
// resolution memo (hooks.mjs) every such require runs Node's resolver
// (Module._findPath) again on every file; without the held transform (transform.mjs)
// every compiled source is read again. Both are asserted on the work itself, not on
// the memo's own counters, which a memo that counted a hit and resolved anyway would
// still advance.
const here = path.dirname(fileURLToPath(import.meta.url));
// One requiring directory for both files: the memo is keyed by it, as Node keys its
// own relativeResolveCache.
const req = createRequire(path.join(here, "resolution-memo.fixture.cjs"));
const FIXTURE_TS = path.join(here, "resolution-memo-fixture.ts");
const LIBRARY = "rn-condition-lib"; // resolved through its `exports` map

// Which of the pair runs first varies (see 01-first.test.ts). The first leaves a
// marker in the run's temporary root (tests/support/temp-root.global.ts, removed when
// the run ends), shared by every worker; the second asserts against it. Both must run
// in one worker for the second to observe anything, so a marker from another worker
// fails the pair instead of passing it without a check.
const marker = path.join(os.tmpdir(), "vn-resolution-memo-pair");

/** The worker that ran first, or null when this file is first (and has said so). */
function claimFirst(): string | null {
  try {
    // Exclusive create: of two files that start at once, exactly one is first.
    fs.writeFileSync(marker, String(threadId), { flag: "wx" });
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return fs.readFileSync(marker, "utf8");
  }
}

export function loadAgainAfterThePreviousFile() {
  const previous = claimFirst();
  const findPath = vi.spyOn(Module, "_findPath");
  const read = vi.spyOn(fs, "readFileSync");
  let lib: { entry: string };
  let ts: { value: string };
  let nodeResolutions: number;
  let sourceReads: number;
  try {
    lib = req(LIBRARY);
    ts = req(FIXTURE_TS);
    // Counted before mockRestore, which clears the recorded calls.
    nodeResolutions = findPath.mock.calls.filter(([request]) => request === LIBRARY).length;
    sourceReads = read.mock.calls.filter(([file]) => String(file) === FIXTURE_TS).length;
  } finally {
    findPath.mockRestore();
    read.mockRestore();
  }

  // Whatever answered, the answer is Node's: the "react-native" export condition.
  expect(lib.entry).toBe("native");
  expect(ts.value).toBe("fixture");

  if (previous === null) return;
  fs.rmSync(marker, { force: true });
  expect(previous, "both files of the pair ran in one worker").toBe(String(threadId));
  // Loaded by the previous file, dropped by the reset, loaded again here.
  expect(nodeResolutions, "Node does not resolve the library again").toBe(0);
  expect(sourceReads, "an unchanged compiled source is not read again").toBe(0);
}
