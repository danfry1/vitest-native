import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { threadId } from "node:worker_threads";
import { expect } from "vitest";

// Shared by 16/17: a source Node loads (here through the CommonJS `.ts` hook) and
// that changes between test files, as an edit in watch mode does, is seen by the
// next file. The engine holds each compiled source in memory for the worker's life
// and no longer reads a file it already holds (transform.mjs); what keeps that
// correct is that the held output is keyed by the file's size and mtime.
const dir = path.join(os.tmpdir(), `vn-source-edit-${process.pid}-${threadId}`);
const file = path.join(dir, "edited.ts");
const req = createRequire(path.join(dir, "index.cjs"));

export function editThenLoad() {
  fs.mkdirSync(dir, { recursive: true });
  // Grows on every write, so the size changes as well as the mtime.
  const previous = fs.existsSync(file) ? /"(x*)"/.exec(fs.readFileSync(file, "utf8"))![1] : "";
  const next = previous + "x";
  fs.writeFileSync(file, `export const edit: string = "${next}";\n`);
  expect(req(file).edit).toBe(next);
  // The other file of the pair edits it again; it removes the directory once it has
  // seen two edits.
  if (previous.length >= 1) fs.rmSync(dir, { recursive: true, force: true });
}
