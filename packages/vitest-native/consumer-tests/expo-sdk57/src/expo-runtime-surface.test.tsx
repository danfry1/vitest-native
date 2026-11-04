import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "vitest";
import { missingMembers, readRuntimeSurface } from "./lib/expo-runtime-surface";

// The engine's globalThis.expo stand-in has every member of SDK 57's runtime, read from the
// expo-modules-core this install resolves through `expo` (lib/expo-runtime-surface.ts). The
// package's unit test runs the same check against the workspace's SDK 58.
test("the globalThis.expo stand-in has every member of SDK 57's runtime", () => {
  const expoManifest = createRequire(import.meta.url).resolve("expo/package.json");
  const coreManifest = createRequire(expoManifest).resolve("expo-modules-core/package.json");
  expect(JSON.parse(fs.readFileSync(coreManifest, "utf8")).version).toMatch(/^57\./);
  const real = readRuntimeSurface(path.dirname(coreManifest));
  expect(Object.keys(real.classes)).toEqual(
    expect.arrayContaining(["EventEmitter", "NativeModule", "SharedObject", "SharedRef"]),
  );
  expect(missingMembers((globalThis as { expo: Record<string, any> }).expo, real)).toEqual([]);
});
