/**
 * The error contract, and the deliberate exceptions to it.
 *
 * Measured before designing this: across the worker boundary Vitest keeps only `name`,
 * `message` and `stack` — `code` and every other own property is dropped. So `code` is
 * for programmatic handling in-process, and the message has to stay self-sufficient.
 * These tests hold that line.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VitestNativeError, VitestNativeTypeError, isVitestNativeError } from "../src/errors.mjs";
import { reactNative } from "../src/plugin.js";
import { validateOptions } from "../src/validate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "..", "src");

describe("the error classes", () => {
  it("prefix the message exactly once, however the caller wrote it", () => {
    expect(new VitestNativeError("INVALID_OPTION", "plain").message).toBe("[vitest-native] plain");
    expect(new VitestNativeError("INVALID_OPTION", "[vitest-native] already").message).toBe(
      "[vitest-native] already",
    );
  });

  it("keep the built-in hierarchy so consumers can still narrow", () => {
    expect(new VitestNativeError("INVALID_OPTION", "x")).toBeInstanceOf(Error);
    // A badly typed option IS a TypeError; flattening everything into one class would
    // lose that.
    expect(new VitestNativeTypeError("INVALID_OPTION", "x")).toBeInstanceOf(TypeError);
    expect(new VitestNativeTypeError("INVALID_OPTION", "x")).toBeInstanceOf(Error);
  });

  it("carry the code and recognise both classes", () => {
    const e = new VitestNativeError("UNSUPPORTED_POOL", "x");
    expect(e.code).toBe("UNSUPPORTED_POOL");
    expect(isVitestNativeError(e)).toBe(true);
    expect(isVitestNativeError(new VitestNativeTypeError("INVALID_OPTION", "x"))).toBe(true);
    expect(isVitestNativeError(new Error("someone else's"))).toBe(false);
  });

  it("append docs to the message, since fields do not reach the reporter", () => {
    const e = new VitestNativeError("JEST_API_UNSUPPORTED", "no equivalent", {
      docs: "https://example/guide",
    });
    expect(e.message).toContain("https://example/guide");
  });

  it("preserve the cause chain", () => {
    const cause = new Error("underlying");
    expect(new VitestNativeError("TRANSFORM_FAILED", "wrapped", { cause }).cause).toBe(cause);
  });
});

describe("real throw sites", () => {
  it("a bad option throws the typed error with a code", () => {
    try {
      validateOptions({ engine: "nonsense" });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(isVitestNativeError(e)).toBe(true);
      expect((e as VitestNativeTypeError).code).toBe("INVALID_OPTION");
      expect(e).toBeInstanceOf(TypeError);
    }
  });

  it("an unrecognised name is a different code from a bad type", () => {
    try {
      validateOptions({ hotRuntime: { recycleAfterFile: 1 } });
      expect.unreachable("should have thrown");
    } catch (e) {
      // The distinction matters: one means "you typed the wrong thing", the other
      // "this value is the wrong shape".
      expect((e as VitestNativeTypeError).code).toBe("UNKNOWN_OPTION");
      expect((e as Error).message).toContain("recycleAfterFiles");
    }
  });

  it("the plugin entry point throws the typed error too", () => {
    expect(() => reactNative({ platform: "windows" } as never)).toThrow(VitestNativeTypeError);
  });
});

describe("every message this package throws is attributable", () => {
  /** Source files that throw, excluding the two documented exceptions below. */
  function sourceFiles(dir: string, found: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) sourceFiles(full, found);
      else if (/\.(ts|mjs)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) found.push(full);
    }
    return found.sort();
  }

  // Deliberate exceptions, each for a reason that would be lost if this test simply
  // demanded uniformity:
  //
  //   mocks/apis/*  — reproduce React Native's OWN error strings verbatim
  //                   ("inputRange must have at least 2 elements"), so a suite that
  //                   matches React Native's message keeps working. Prefixing them
  //                   would break that fidelity.
  //   matchers/     — matcher failures use Vitest's matcherHint formatting, which is
  //                   what a user expects an assertion failure to look like. A
  //                   "[vitest-native]" prefix in front of that is noise.
  //   errors.ts     — defines the classes.
  const EXEMPT = [
    path.join("mocks", "apis"),
    path.join("matchers", ""),
    path.join("src", "errors.ts"),
  ];

  it("throws a vitest-native error class, or is an exemption with a stated reason", () => {
    const offenders: string[] = [];
    let converted = 0;
    for (const file of sourceFiles(srcRoot)) {
      if (EXEMPT.some((frag) => file.includes(frag))) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const match of text.matchAll(/throw new (\w+)\(/g)) {
        const cls = match[1];
        if (cls === "VitestNativeError" || cls === "VitestNativeTypeError") {
          converted += 1;
          continue;
        }
        const line = text.slice(0, match.index).split("\n").length;
        offenders.push(`${path.relative(srcRoot, file)}:${line} throws ${cls}`);
      }
    }
    // Guards the guard: an empty `offenders` means nothing only if the scan actually
    // reached the throw sites. If the walk or the exemptions ever swallow everything,
    // this fails instead of reporting success.
    expect(converted).toBeGreaterThanOrEqual(15);
    expect(offenders).toEqual([]);
  });
});
