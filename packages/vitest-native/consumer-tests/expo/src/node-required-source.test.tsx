import { createRequire } from "node:module";
import { expect, test } from "vitest";

// App source required through Node (`jest.requireActual`, `require` in a test) is
// compiled by the engine's Babel transform rather than Vite. `export * as ns` needs
// @babel/plugin-transform-export-namespace-from, which Expo's toolchain provides; the
// React Native preset alone rejects it.
test("compiles a namespace re-export in app source required through Node", () => {
  const { greeting } = createRequire(import.meta.url)("./lib/namespaced");
  expect(greeting.hello("expo")).toBe("hello expo");
});
