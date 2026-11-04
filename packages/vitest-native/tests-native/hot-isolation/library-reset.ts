import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { threadId } from "node:worker_threads";
import { expect } from "vitest";
import { projectContext } from "../../src/context.mjs";

// Shared by 19/20: the library registry (native/registry.mjs, buildLibraryRegistry),
// which serves Reanimated's own mock and worklets, is reset with React Native's before
// every file. A file after one that ran Reanimated starts with none of its modules run,
// so no file sees a library instance linked to a previous file's React Native.
// (Worklets' mock is built as each file is set up, so only Reanimated's are counted.)
const projectRoot = projectContext()?.projectRoot ?? process.cwd();
const req = createRequire(path.join(projectRoot, "package.json"));

// Which of the pair runs first varies; see resolution-memo.ts for the marker protocol.
const marker = path.join(os.tmpdir(), "vn-library-reset-pair");

/** The worker that ran first, or null when this file is first (and has said so). */
function claimFirst(): string | null {
  try {
    fs.writeFileSync(marker, String(threadId), { flag: "wx" });
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return fs.readFileSync(marker, "utf8");
  }
}

export function runReanimatedFromAResetRegistry() {
  const previous = claimFirst();
  const library = req(projectContext()!.registry as string).__vitestNativeRegistry.library as {
    ran(): string[];
  };
  expect(library, "the library registry is installed").toBeTruthy();
  const reanimatedRan = () =>
    library.ran().filter((file) => /[\\/]react-native-reanimated[\\/]/.test(file)).length;
  const atStart = reanimatedRan();
  const reanimated = req("react-native-reanimated");
  expect(typeof reanimated.useSharedValue).toBe("function");
  expect(reanimatedRan(), "Reanimated is served from the registry").toBeGreaterThan(0);

  if (previous === null) return;
  fs.rmSync(marker, { force: true });
  expect(previous, "both files of the pair ran in one worker").toBe(String(threadId));
  // The previous file ran Reanimated in this worker; the reset cleared it.
  expect(atStart, "the file starts with none of Reanimated's modules run").toBe(0);
}
