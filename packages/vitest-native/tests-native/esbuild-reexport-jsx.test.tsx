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
import * as Badge from "rn-esbuild-reexport-lib";
// The same package through its CommonJS index alone, which Node runs as published and
// reads the names of from the loaded module: a guard that it stays that way.
import * as BadgeCjs from "rn-esbuild-reexport-lib/cjs";

it.each([
  ["the ES build, compiled", Badge],
  ["the CommonJS index, as published", BadgeCjs],
])("the namespace of %s carries the parts its index re-exports", (_, namespace) => {
  expect(Object.keys(namespace)).toEqual(expect.arrayContaining(["Root", "Label"]));
  expect(typeof namespace.Root).toBe("function");
});

it.each([
  ["the ES build", Badge],
  ["the CommonJS index", BadgeCjs],
])("renders the parts of %s", async (_, B) => {
  await render(
    <B.Root testID="badge">
      <B.Label>new</B.Label>
    </B.Root>,
  );
  expect(screen.getByTestId("badge")).toBeTruthy();
  expect(screen.getByText("new")).toBeTruthy();
});
