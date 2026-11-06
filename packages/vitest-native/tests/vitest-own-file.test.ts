// experimental.nodeMocks never serves a mock to an import Vitest makes itself (its
// evaluator loading an original), told by the importer's path (native/match.mjs).
import { expect, it } from "vitest";
import { isVitestOwnFile } from "../src/native/match.mjs";

it("is Vitest's and Vite's installed dist", () => {
  expect(isVitestOwnFile("/app/node_modules/vitest/dist/module-evaluator.js")).toBe(true);
  expect(isVitestOwnFile("/app/node_modules/vite/dist/node/module-runner.js")).toBe(true);
  expect(isVitestOwnFile("/app/node_modules/@vitest/mocker/dist/index.js")).toBe(true);
  expect(
    isVitestOwnFile("/r/node_modules/.bun/vitest@5.0.5/node_modules/vitest/dist/chunks/a.js"),
  ).toBe(true);
  expect(isVitestOwnFile("C:\\app\\node_modules\\vitest\\dist\\module-evaluator.js")).toBe(true);
});

it("is not a checkout or a project that happens to be named vite", () => {
  expect(isVitestOwnFile("/home/me/code/vite/dist/index.js")).toBe(false);
  expect(isVitestOwnFile("/app/node_modules/vite-plugin-x/dist/index.js")).toBe(false);
  expect(isVitestOwnFile("/app/src/vitest/dist/x.js")).toBe(false);
});
