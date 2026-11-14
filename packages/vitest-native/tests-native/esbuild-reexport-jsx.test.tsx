/**
 * A component library built by esbuild/tsup with JSX preserved: its CommonJS index
 * re-exports `./badge`, and badge.js is JSX the engine compiles. Imported as a
 * namespace, the parts must be there.
 *
 * Node builds a CommonJS module's ES namespace with cjs-module-lexer, and for a
 * re-export it reads the re-exported file from disk, past the module loader's hooks.
 * There it met badge.js's JSX, which the lexer cannot read, so `Root` and `Label`
 * were dropped and the namespace held only `default`. The ES build is where this bit:
 * its `export * from "./badge"`, compiled, is Babel's `Object.keys(_badge).forEach`
 * re-export. Vitest takes a namespace with
 * `__esModule` as it is, so `Badge.Root` was undefined and rendering it failed with
 * "Element type is invalid". The loader now lists the names a module re-exports from
 * files it compiles (compiledReexports in native/loader.mjs).
 */
import * as React from "react";
import { render, screen } from "@testing-library/react-native";
import { expect, it } from "vitest";
import { projectContext } from "../src/context.mjs";
// The same package through its CommonJS index alone, which Node runs as published and
// reads the names of from the loaded module: a guard that it stays that way.
import * as BadgeCjs from "rn-esbuild-reexport-lib/cjs";

// Under the hot runtime on Node 22 the ES index fails to link its CommonJS sibling, on
// main as here (#847), so there the ES-build cases are skipped and the import not made.
const esIndexLinks = !(
  (globalThis as { __vitest_native_hot_generation?: unknown }).__vitest_native_hot_generation !==
    undefined && process.versions.node.startsWith("22.")
);
const Badge = (esIndexLinks ? await import("rn-esbuild-reexport-lib") : {}) as typeof BadgeCjs;

// The bug's condition: the namespace is built from the ES index, which the engine
// compiles, and whose re-exported module Node cannot read from disk. The CommonJS index,
// run as published, never had the bug, so a resolution change to it would pass vacuously.
// The ownership models resolve the import through the `require` condition instead (#838),
// so there this file checks the CommonJS index only.
const ownershipModel = projectContext()?.ownershipModel;

it.runIf(ownershipModel === undefined && esIndexLinks)(
  "resolves the package to its ES index, the build the bug was in",
  () => {
    expect(import.meta.resolve("rn-esbuild-reexport-lib")).toMatch(/\/build\/index\.mjs(?:\?|$)/);
  },
);

it.runIf(ownershipModel !== undefined)(
  "resolves the package to its CommonJS index under the ownership models (#838)",
  () => {
    expect(import.meta.resolve("rn-esbuild-reexport-lib")).toMatch(/\/build\/index\.js(?:\?|$)/);
  },
);

const builds = [
  ["the ES build, compiled", Badge, esIndexLinks],
  ["the CommonJS index, as published", BadgeCjs, true],
] as const;

for (const [name, B, runs] of builds) {
  it.runIf(runs)(`the namespace of ${name} carries the parts its index re-exports`, () => {
    expect(Object.keys(B)).toEqual(expect.arrayContaining(["Root", "Label"]));
    expect(typeof B.Root).toBe("function");
  });

  it.runIf(runs)(`renders the parts of ${name}`, async () => {
    await render(
      <B.Root testID="badge">
        <B.Label>new</B.Label>
      </B.Root>,
    );
    expect(screen.getByTestId("badge")).toBeTruthy();
    expect(screen.getByText("new")).toBeTruthy();
  });
}
