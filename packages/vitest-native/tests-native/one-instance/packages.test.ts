/**
 * The load hook leaves an installed package to Node without resolving it, and must
 * decide that as Node does: from the requiring file's directory, after aliases.
 * packages.global.ts creates the packages.
 */
import { expect, it } from "vitest";
import { state as workspaceState } from "./fixtures/fp-src/index";
// @ts-expect-error: resolved through the config's alias
import { state as aliasedState } from "vn-alias-probe/feature";

it("a workspace package linked in the requiring file's node_modules is Vite's instance", () => {
  // The package root has an installed vn-fp-probe; Node, from fp-app, finds the link.
  workspaceState.value = "vite";
  expect((require("./fixtures/fp-app/reader.cjs") as () => string | null)()).toBe("vite");
});

it("an aliased subpath of an installed package's name is Vite's instance", () => {
  aliasedState.value = "vite";
  expect((require("./fixtures/aliased-reader.cjs") as () => string | null)()).toBe("vite");
});
