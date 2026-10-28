/**
 * The ownership guard, live in this suite (docs/ownership-guard.md).
 *
 * Every native suite runs with the guard, and CI runs them with
 * VITEST_NATIVE_OWNERSHIP_MODE=error to show there are no dual evaluations in them. That
 * claim is only worth something if the guard is actually watching, so this file makes
 * one on purpose and checks it is caught, in whichever mode the run uses.
 *
 * The shape is the one jest-compat cannot repair: Node loads the file first (a `require`
 * from a test, which is Vitest's Node `require`), then Vite imports it. jest-compat
 * shares Vite's instance only when Vite got there first (viteInstanceOf in
 * node-registry.mjs), so here two copies used to exist in silence.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

declare const require: (id: string) => { store: { value: string | null } };

const ledger = (
  globalThis as Record<
    symbol,
    { mode: "warn" | "error"; conflicts: { file: string }[] } | undefined
  >
)[Symbol.for("vitest-native.ownership-ledger")];

const STORE = /fixtures[\\/]dual-evaluation[\\/]store\.ts was evaluated by both Node and Vite/;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a file evaluated by Node and then by Vite", () => {
  it("is installed in this worker", () => {
    expect(ledger?.mode).toMatch(/^(warn|error)$/);
  });

  it("is reported with both sides, the owner and the route", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const viaNode = require("./fixtures/dual-evaluation/store.ts");
    viaNode.store.value = "written through Node";

    let message = "";
    if (ledger?.mode === "error") {
      // Fail-closed: the second copy is never handed to the importer.
      const error = await import("./fixtures/dual-evaluation/store").then(
        () => null,
        (e: Error) => e,
      );
      expect(error?.message).toBeDefined();
      message = error!.message;
    } else {
      const viaVite = await import("./fixtures/dual-evaluation/store");
      // What the guard exists to surface: the write is invisible to the other copy.
      expect(viaVite.store).not.toBe(viaNode.store);
      expect(viaVite.store.value).toBeNull();
      const reports = warn.mock.calls.map(([text]) => String(text)).filter((t) => STORE.test(t));
      expect(reports).toHaveLength(1);
      message = reports[0] ?? "";
    }
    // Node's spelling of the path: backslashes on Windows.
    expect(message).toMatch(STORE);
    expect(message).toContain("policy owner -> Vite (project-source)");
    expect(message).toMatch(
      /first\s+-> Node \(CommonJS\), required by .*ownership-guard\.test\.ts/,
    );
    expect(message).toMatch(/second\s+-> Vite, imported by .*ownership-guard\.test\.ts/);
    expect(message).toContain("route        -> require() in a file Vite evaluated");
    if (ledger?.mode === "error") {
      expect(message).toContain("Vite's copy was refused before its body ran");
    }
    // Handled here on purpose: take it off this file's list, or the setup file's
    // end-of-file check fails the file for it (and the run summary lists it).
    const mine = ledger!.conflicts.filter((c) => /dual-evaluation[\\/]store\.ts$/.test(c.file));
    expect(mine.length).toBeGreaterThan(0);
    for (const conflict of mine) ledger!.conflicts.splice(ledger!.conflicts.indexOf(conflict), 1);
  });
});
