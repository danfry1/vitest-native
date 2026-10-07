import { describe, expect, it, vi } from "vitest";
import { createStateManifest, HOT_STATE_MANIFEST_ENTRIES } from "../src/native/state-manifest.mjs";
import { isResidentImportListener } from "../src/native/reset.mjs";

describe("hot-runtime import attribution", () => {
  const root = "/work/app";

  it("blesses only dependencies whose shared ownership policy is worker-resident", () => {
    expect(
      isResidentImportListener(
        "Error\n    at /work/app/node_modules/@testing-library/react-native/index.js:1:1",
        root,
      ),
    ).toBe(true);
    expect(
      isResidentImportListener(
        "Error\n    at /work/app/node_modules/an-ordinary-package/index.js:1:1",
        root,
      ),
    ).toBe(false);
  });

  it("recognises hoisted resident packages outside the project root", () => {
    expect(
      isResidentImportListener(
        "Error\n    at /work/node_modules/react-test-renderer/index.js:1:1",
        root,
      ),
    ).toBe(true);
  });

  it("keeps a project-owned caller test-phase even when it passes through a resident package", () => {
    expect(
      isResidentImportListener(
        "Error\n" +
          "    at /work/app/node_modules/@testing-library/react-native/index.js:1:1\n" +
          "    at /work/app/src/render.ts:2:1",
        root,
      ),
    ).toBe(false);
  });
});

describe("hot-runtime state manifest", () => {
  it("publishes the complete built-in entry list for diagnostics and mutation gates", () => {
    expect(HOT_STATE_MANIFEST_ENTRIES).toEqual([
      "vitest-runtime",
      "native-boundary-mocks",
      "native-module-mocks",
      "react-native.dimensions",
      "react-native.appearance",
      "react-native.event-listeners",
      "process.env",
      "process.listeners",
      "global.descriptors",
      "console.descriptors",
      "react-native.error-utils",
      "expo.runtime",
      "jest-compat.node-mocks",
    ]);
  });

  it("captures once, then restores and verifies before each later file", () => {
    let state = "boot";
    const capture = vi.fn(() => state);
    const restore = vi.fn((snapshot: string) => {
      state = snapshot;
    });
    const verify = vi.fn((snapshot: string) => {
      if (state !== snapshot) throw new Error("state differs");
    });
    const manifest = createStateManifest();

    expect(manifest.register({ id: "example", capture, restore, verify })).toBe(true);
    manifest.beginFile();
    state = "polluted";
    manifest.beginFile();

    expect(state).toBe("boot");
    expect(capture).toHaveBeenCalledOnce();
    expect(restore).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledOnce();
  });

  it("registers idempotently when setup files re-evaluate", () => {
    const firstRestore = vi.fn();
    const duplicateRestore = vi.fn();
    const manifest = createStateManifest();

    expect(manifest.register({ id: "setup", capture: () => null, restore: firstRestore })).toBe(
      true,
    );
    expect(manifest.register({ id: "setup", capture: () => null, restore: duplicateRestore })).toBe(
      false,
    );
    manifest.beginFile();
    manifest.beginFile();

    expect(firstRestore).toHaveBeenCalledOnce();
    expect(duplicateRestore).not.toHaveBeenCalled();
    expect(manifest.entries()).toEqual(["setup"]);
  });

  it("uses explicit restore order and verifies only after every restore", () => {
    const calls: string[] = [];
    const manifest = createStateManifest();
    manifest.register({
      id: "late",
      restoreOrder: 100,
      capture: () => null,
      restore: () => calls.push("restore late"),
      verify: () => calls.push("verify late"),
    });
    manifest.register({
      id: "early",
      restoreOrder: -100,
      capture: () => null,
      restore: () => calls.push("restore early"),
      verify: () => calls.push("verify early"),
    });

    manifest.beginFile();
    manifest.beginFile();

    expect(calls).toEqual(["restore early", "restore late", "verify early", "verify late"]);
  });

  it("captures entries registered after initialization immediately", () => {
    const capture = vi.fn(() => "late baseline");
    const manifest = createStateManifest();
    manifest.beginFile();

    expect(manifest.register({ id: "late", capture, restore: () => {}, verify: () => {} })).toBe(
      true,
    );
    expect(capture).toHaveBeenCalledOnce();
  });

  it("turns a disabled restore action into a named mutation failure", () => {
    let state = "boot";
    const manifest = createStateManifest({ mutation: "state-under-test" });
    manifest.register({
      id: "state-under-test",
      capture: () => state,
      restore: (snapshot) => {
        state = snapshot;
      },
      verify: (snapshot) => {
        if (state !== snapshot) throw new Error(`observed ${state}`);
      },
    });
    manifest.beginFile();
    state = "polluted";

    expect(() => manifest.beginFile()).toThrowError(
      expect.objectContaining({
        code: "HOT_STATE_RESTORE_FAILED",
        message: expect.stringContaining("state-under-test verify: observed polluted"),
      }),
    );
  });

  it("attributes capture failures to the responsible entry", () => {
    const cause = new Error("capture exploded");
    const manifest = createStateManifest();
    manifest.register({
      id: "broken-capture",
      capture: () => {
        throw cause;
      },
      restore: () => {},
    });

    expect(() => manifest.beginFile()).toThrowError(
      expect.objectContaining({
        cause,
        code: "HOT_STATE_CAPTURE_FAILED",
        message: expect.stringContaining("broken-capture"),
      }),
    );
  });

  it("collects restore and verification failures instead of hiding later entries", () => {
    const manifest = createStateManifest();
    manifest.register({
      id: "restore-failure",
      capture: () => null,
      restore: () => {
        throw new Error("restore exploded");
      },
    });
    manifest.register({
      id: "verify-failure",
      capture: () => null,
      restore: () => {},
      verify: () => {
        throw new Error("verify exploded");
      },
    });
    manifest.beginFile();

    expect(() => manifest.beginFile()).toThrowError(
      expect.objectContaining({
        message: expect.stringMatching(
          /restore-failure restore: restore exploded[\s\S]*verify-failure verify: verify exploded/,
        ),
      }),
    );
  });
});
