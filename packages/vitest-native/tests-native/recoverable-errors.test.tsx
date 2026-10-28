// React's recoverable errors are logged, and every other report still fails the run
// (src/report-error.mjs). The mock engine runs the same cases (tests/recoverable-errors.test.tsx).
import { createRequire } from "node:module";
import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { reportRendererError } from "../src/report-error.mjs";

const RECOVERED = "There was an error during concurrent rendering but React was able to recover";

afterEach(() => vi.restoreAllMocks());

/** Records the uncaughtException emits that would fail the run, without emitting them. */
function captureUncaught() {
  const emit = process.emit.bind(process);
  const uncaught: unknown[] = [];
  vi.spyOn(process, "emit").mockImplementation(((event: string, ...args: unknown[]) => {
    if (event === "uncaughtException") {
      uncaught.push(args[0]);
      return true;
    }
    return emit(event as never, ...(args as never[]));
  }) as typeof process.emit);
  return uncaught;
}

describe("native engine: React error reports", () => {
  it("gives reportError to the renderer only", () => {
    // react-test-renderer is loaded (imported above) and captured it as it evaluated;
    // nothing else finds one, as under Node without vitest-native.
    expect(typeof TestRenderer.create).toBe("function");
    expect(Object.hasOwn(globalThis, "reportError")).toBe(false);
  });

  it("leaves a library that feature-detects reportError as it is under Node", () => {
    const uncaught = captureUncaught();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // A web-standard-aware library reporting an error from a callback it must not
    // throw from: with no reportError it logs.
    function safeInvoke(callback: () => void) {
      try {
        callback();
      } catch (error) {
        const g = globalThis as { reportError?: (error: unknown) => void };
        if (typeof g.reportError === "function") g.reportError(error);
        else console.error("[lib] listener threw:", error);
      }
    }
    safeInvoke(() => {
      throw new Error("listener boom");
    });
    expect(uncaught).toEqual([]);
    expect(logged).toHaveBeenCalledWith("[lib] listener threw:", expect.any(Error));
  });

  it("logs a recoverable error from a concurrent root instead of failing the run", async () => {
    const uncaught = captureUncaught();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    let renders = 0;
    function ThrowsOnce() {
      renders++;
      if (renders === 1) throw new Error("first render fails");
      return <Text>recovered</Text>;
    }
    let root!: TestRenderer.ReactTestRenderer;
    await act(() => {
      root = TestRenderer.create(<ThrowsOnce />, { unstable_isConcurrent: true });
    });
    expect(JSON.stringify(root.toJSON())).toContain("recovered");
    expect(uncaught).toEqual([]);
    const reported = logged.mock.calls.map(([error]) => error as Error);
    expect(reported.map((error) => error?.message)).toContainEqual(
      expect.stringContaining(RECOVERED),
    );
    expect(reported.find((error) => error?.message?.includes(RECOVERED))?.cause).toMatchObject({
      message: "first render fails",
    });
  });

  it("still throws a render error that does not recover from act()", async () => {
    const uncaught = captureUncaught();
    vi.spyOn(console, "error").mockImplementation(() => {});
    function AlwaysThrows(): React.ReactNode {
      throw new Error("every render fails");
    }
    await expect(
      act(async () => {
        TestRenderer.create(<AlwaysThrows />, { unstable_isConcurrent: true });
      }),
    ).rejects.toThrow("every render fails");
    expect(uncaught).toEqual([]);
  });

  it("reports anything else as an uncaught exception, as React's own fallback does", () => {
    const uncaught = captureUncaught();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("uncaught");
    const report = reportRendererError;
    // The name React's uncaught-error handler has; only the recoverable one is logged.
    function defaultOnUncaughtError(e: unknown) {
      report(e);
    }
    defaultOnUncaughtError(error);
    report("thrown string");
    expect(uncaught).toEqual([error, "thrown string"]);
    expect(logged).not.toHaveBeenCalled();
  });

  it("matches how the installed react-test-renderer reports errors", () => {
    // The mechanism report-error.mjs relies on, read from the installed renderer so an
    // upgrade that changes it fails here by name rather than as an unhandled error.
    const req = createRequire(import.meta.url);
    const source = fs.readFileSync(
      req.resolve("react-test-renderer/cjs/react-test-renderer.development.js"),
      "utf8",
    );
    expect(source).toMatch(
      /function defaultOnRecoverableError\(error\) \{\s*reportGlobalError\(error\);/,
    );
    expect(source).toMatch(
      /reportGlobalError =\s*"function" === typeof reportError\s*\? reportError/,
    );
  });
});
