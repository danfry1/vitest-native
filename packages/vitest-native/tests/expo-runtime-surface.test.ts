/**
 * The native engine's `globalThis.expo` stand-in keeps up with Expo's real runtime.
 *
 * Real expo-modules-core JS runs on the stand-in (src/native/globals.mjs, installExpoGlobal),
 * so a member the runtime has and the stand-in lacks fails wherever Expo's JS reaches it:
 * SharedObject.prototype.release was missing, and every unmount of a component using
 * useReleasingSharedObject (expo-video, expo-audio, expo-image) threw. The real surface is
 * read from the installed expo-modules-core's own JS runtime (its web/jest polyfill), so a new
 * SDK's members fail this test until the stand-in has them or DELIBERATELY_OMITTED says why not.
 *
 * This covers the SDK the workspace installs (58). The SDK 57 consumer fixture runs the same
 * check on its packed install (consumer-tests/expo-sdk57/src/expo-runtime-surface.test.tsx),
 * with a copy of the reader scripts/test-consumers.mjs puts beside it.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DELIBERATELY_OMITTED,
  missingMembers,
  readRuntimeSurface,
} from "./support/expo-runtime-surface";
// @ts-expect-error — runtime .mjs
import { installGlobals } from "../src/native/globals.mjs";
import { SUPPORTED_EXPO_SDKS } from "../src/peer-requirements.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const g = globalThis as { expo?: any };

// expo-modules-core as the workspace's `expo` resolves it: the copy Expo's JS runs against.
const expoManifest = createRequire(path.join(PACKAGE_ROOT, "package.json")).resolve(
  "expo/package.json",
);
const coreDir = path.dirname(createRequire(expoManifest).resolve("expo-modules-core/package.json"));
const major = (version: string) => Number(/\d+/.exec(version)?.[0]);
const versionOf = (manifest: string) =>
  (JSON.parse(fs.readFileSync(manifest, "utf8")) as { version: string }).version;

let saved: unknown;
let standin: Record<string, any>;
beforeEach(() => {
  saved = g.expo;
  delete g.expo;
  installGlobals();
  standin = g.expo;
});
afterEach(() => {
  g.expo = saved;
});

describe("the installed expo-modules-core", () => {
  // From SDK 55, expo-modules-core's major is the SDK's; Expo's own table of the versions
  // each SDK bundles says which one an SDK runs.
  it("is the one the workspace's Expo SDK bundles, and a supported SDK", () => {
    const sdk = major(versionOf(expoManifest));
    const bundled = JSON.parse(
      fs.readFileSync(path.join(path.dirname(expoManifest), "bundledNativeModules.json"), "utf8"),
    ) as Record<string, string>;
    expect(major(bundled["expo-modules-core"])).toBe(sdk);
    expect(major(versionOf(path.join(coreDir, "package.json")))).toBe(sdk);
    expect(sdk).toBeGreaterThanOrEqual(SUPPORTED_EXPO_SDKS.minimum);
    expect(sdk).toBeLessThanOrEqual(SUPPORTED_EXPO_SDKS.maximum);
  });
});

describe("the globalThis.expo stand-in", () => {
  it("has every member of the installed runtime, less the deliberate omissions", () => {
    const real = readRuntimeSurface(coreDir);
    // The reader found the runtime: the four classes and the keys around them.
    expect(Object.keys(real.classes)).toEqual(
      expect.arrayContaining(["EventEmitter", "NativeModule", "SharedObject", "SharedRef"]),
    );
    expect(Object.keys(real.expo)).toEqual(expect.arrayContaining(["modules", "uuidv4"]));
    expect(missingMembers(standin, real)).toEqual([]);
  });

  it("omits only members the installed runtime has", () => {
    // A stale omission would excuse a member nobody checks any more. Against classes with
    // no members, every member of the runtime is missing.
    const real = readRuntimeSurface(coreDir);
    const empty = Object.fromEntries(
      Object.keys(real.classes).map((name) => [name, function NoMembers() {}]),
    );
    const members = missingMembers(empty, real, {});
    for (const key of Object.keys(DELIBERATELY_OMITTED)) expect(members).toContain(key);
  });

  it("answers uuidv5 as the native runtime does", () => {
    // RFC 4122's example: the DNS namespace and "www.example.com".
    expect(standin.uuidv5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    );
  });

  it("rejects a uuidv5 namespace that is not a UUID string, as the native runtime does", () => {
    for (const namespace of [
      "not-a-uuid",
      "6ba7b810-9dad-11d1-80b4",
      "6ba7b8109dad11d180b400c04fd430c8",
    ]) {
      expect(() => standin.uuidv5("www.example.com", namespace)).toThrow(
        `Namespace: \`${namespace}\` is not a valid namespace. Namespace should be a valid UUID string`,
      );
    }
  });

  it("names each module stub as the native runtime names a registered module", () => {
    const module = standin.modules.VNNamedModule;
    expect(module.__expo_module_name__).toBe("VNNamedModule");
    // The module's own, not a test file's change: not enumerated, and kept through a reset.
    expect(Object.keys(module)).not.toContain("__expo_module_name__");
    standin[Symbol.for("vitest-native.expo.reset")]();
    expect(module.__expo_module_name__).toBe("VNNamedModule");
    expect(standin[Symbol.for("vitest-native.expo.reset")].verify()).toBe(true);
  });

  it("reads the runtime from the installed files, so a member they add fails the check", () => {
    // A copy of the installed polyfill with one more EventEmitter method and one more key.
    const fake = fs.mkdtempSync(path.join(os.tmpdir(), "vn-expo-surface-"));
    try {
      for (const name of ["CoreModule", "dangerous-internal"]) {
        for (const [dir, ext] of [
          ["build", "js"],
          ["src", "ts"],
        ]) {
          const file = path.join(coreDir, dir, "polyfill", `${name}.${ext}`);
          if (!fs.existsSync(file)) continue;
          let text = fs.readFileSync(file, "utf8");
          if (name === "CoreModule") {
            text = text.replace(/(export class EventEmitter\b[^{]*\{)/, "$1\n  vnProbeMethod() {}");
          } else {
            text = text.replace(/(globalThis\.expo = \{)/, "$1\n    vnProbeKey: 1,");
          }
          fs.mkdirSync(path.join(fake, dir, "polyfill"), { recursive: true });
          fs.writeFileSync(path.join(fake, dir, "polyfill", `${name}.${ext}`), text);
        }
      }
      expect(missingMembers(standin, readRuntimeSurface(fake))).toEqual([
        "expo.vnProbeKey",
        "EventEmitter.prototype.vnProbeMethod",
      ]);
    } finally {
      fs.rmSync(fake, { recursive: true, force: true });
    }
  });
});
