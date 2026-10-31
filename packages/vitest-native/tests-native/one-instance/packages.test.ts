/**
 * The load hook leaves an installed package to Node without resolving it, and must
 * decide that as Node does: from the requiring file's directory, after aliases.
 * packages.global.ts creates the packages.
 */
import { expect, it } from "vitest";

const registryStats = () =>
  (globalThis as Record<string, any>).__vitest_native_jest_registry.stats as {
    resolves: number;
    uncached: number;
    toNode: number;
  };
import { fileURLToPath } from "node:url";
import { state as workspaceState } from "./fixtures/fp-src/index";
import { state as selfState } from "./fixtures/self-pkg/store";
// @ts-expect-error: resolved through the config's alias
import { state as aliasedState } from "vn-alias-probe/feature";

it("a workspace package linked in the requiring file's node_modules is Vite's instance", () => {
  // The package root has an installed vn-fp-probe; Node, from fp-app, finds the link.
  const read = require("./fixtures/fp-app/reader.cjs") as () => string | null;
  const stats = registryStats();
  const before = { ...stats };
  workspaceState.value = "vite";
  expect(read()).toBe("vite");
  // Node's answer was reused: the hook did not resolve vn-fp-probe a second time.
  expect(stats.uncached).toBe(before.uncached);
});

it("an aliased subpath of an installed package's name is Vite's instance", () => {
  aliasedState.value = "vite";
  expect((require("./fixtures/aliased-reader.cjs") as () => string | null)()).toBe("vite");
});

it("a package requiring itself by name is Vite's instance, as Node resolves it", () => {
  // Node checks the requiring file's own package.json `exports` before node_modules.
  selfState.value = "vite";
  expect((require("./fixtures/self-pkg/reader.cjs") as () => string | null)()).toBe("vite");
});

it("a mock registered for an installed package reaches require", () => {
  const registry = (globalThis as Record<string, any>).__vitest_native_jest_registry as {
    register(from: string, spec: string, factory: () => unknown): void;
    unregister(from: string, spec: string): void;
  };
  const from = fileURLToPath(import.meta.url);
  registry.register(from, "magic-string", () => ({ mocked: true }));
  try {
    expect(require("./fixtures/requires-installed-mocked.cjs")).toEqual({ mocked: true });
  } finally {
    registry.unregister(from, "magic-string");
  }
});
