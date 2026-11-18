/**
 * A root `__mocks__` mock of a package reaches every installed copy of it (#898): Jest
 * matches a root mock by name, whichever copy a request resolves to. The registry keys
 * the mock by the file the project root resolves, so another copy is matched by the file
 * that copy gives the same subpath, by `import` or by `require`
 * (`copyEntryOf` in jest-compat/node-registry.mjs). A jest.mock factory stays keyed by
 * the file it resolves to, as Jest keys an explicit mock.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { MANUAL_MOCK_FACTORY, nodeRegistry } from "../src/jest-compat/node-registry.mjs";

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-copies-")));
const write = (rel: string, text = "module.exports = {};") => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};
const manifest = (rel: string, name: string, exports: unknown) =>
  write(`${rel}/package.json`, JSON.stringify({ name, exports }));
const importOnly = { "./cid": { import: "./lib/cid.js" } };
const dual = { "./cid": { import: "./esm/cid.js", require: "./cjs/cid.cjs" } };

write("package.json", '{ "name": "app" }');
const appFile = write("src/app.js");

// esm-lib: import-only at the root, dual in consumer-a's nested copy.
manifest("node_modules/esm-lib", "esm-lib", importOnly);
const esmRoot = write("node_modules/esm-lib/lib/cid.js");
manifest("node_modules/consumer-a/node_modules/esm-lib", "esm-lib", dual);
const esmNestedImport = write("node_modules/consumer-a/node_modules/esm-lib/esm/cid.js");
const esmNestedRequire = write("node_modules/consumer-a/node_modules/esm-lib/cjs/cid.cjs");
write("node_modules/consumer-a/package.json", '{ "name": "consumer-a" }');
const consumerA = write("node_modules/consumer-a/index.js");

// dual-lib: dual at the root, import-only in consumer-b's nested copy.
manifest("node_modules/dual-lib", "dual-lib", dual);
const dualRootImport = write("node_modules/dual-lib/esm/cid.js");
const dualRootRequire = write("node_modules/dual-lib/cjs/cid.cjs");
manifest("node_modules/consumer-b/node_modules/dual-lib", "dual-lib", importOnly);
const dualNested = write("node_modules/consumer-b/node_modules/dual-lib/lib/cid.js");

// A pnpm layout: consumer-c and its esm-lib live in the store, linked by symlinks.
manifest("node_modules/.pnpm/esm-lib@3.0.0/node_modules/esm-lib", "esm-lib", importOnly);
const esmStore = write("node_modules/.pnpm/esm-lib@3.0.0/node_modules/esm-lib/lib/cid.js");
write(
  "node_modules/.pnpm/consumer-c@1.0.0/node_modules/consumer-c/package.json",
  '{ "name": "consumer-c" }',
);
write("node_modules/.pnpm/consumer-c@1.0.0/node_modules/consumer-c/index.js");
const link = (target: string, at: string) => {
  fs.mkdirSync(path.dirname(path.join(root, at)), { recursive: true });
  fs.symlinkSync(path.join(root, target), path.join(root, at), "junction");
};
link(
  "node_modules/.pnpm/esm-lib@3.0.0/node_modules/esm-lib",
  "node_modules/.pnpm/consumer-c@1.0.0/node_modules/esm-lib",
);
link("node_modules/.pnpm/consumer-c@1.0.0/node_modules/consumer-c", "node_modules/consumer-c");

write("node_modules/other/package.json", '{ "name": "other", "main": "index.js" }');
const otherIndex = write("node_modules/other/index.js");

const registry = nodeRegistry();
afterEach(() => registry.clear());
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

/** A root mock, as jestMockTransform registers one (a factory named for a manual mock). */
const rootMock = (spec: string) => {
  const factory = { [MANUAL_MOCK_FACTORY]: () => ({}) }[MANUAL_MOCK_FACTORY];
  return registry.register(appFile, spec, factory);
};
const from = (file: string) => ({ filename: file });

describe("a root mock and other installed copies of its package", () => {
  it("keeps the root copy's own file", () => {
    const entry = rootMock("esm-lib/cid");
    expect(registry.lookup(esmRoot, "esm-lib/cid")).toBe(entry);
  });

  it("reaches a nested dual copy's import target and its require target", () => {
    const entry = rootMock("esm-lib/cid");
    expect(registry.lookup(esmNestedImport, "esm-lib/cid")).toBe(entry);
    expect(registry.lookup(esmNestedRequire, "esm-lib/cid")).toBe(entry);
    // Node's require from the consumer resolves the nested copy's CommonJS file.
    expect(registry.resolveFrom("esm-lib/cid", consumerA)).toBe(esmNestedRequire);
  });

  // The root copy's own import target is a file other than the one `require` keys.
  it("reaches a dual root copy's import target as well as its require target", () => {
    const entry = rootMock("dual-lib/cid");
    expect(registry.lookup(dualRootRequire, "dual-lib/cid")).toBe(entry);
    expect(registry.lookup(dualRootImport, "dual-lib/cid")).toBe(entry);
  });

  it("reaches an import-only nested copy when the root copy is dual", () => {
    const entry = rootMock("dual-lib/cid");
    expect(registry.lookup(dualNested, "dual-lib/cid")).toBe(entry);
  });

  it("reaches a copy linked from a pnpm store, by its real path", () => {
    const entry = rootMock("esm-lib/cid");
    // Node resolves consumer-c's import from its real path, where pnpm links its
    // dependencies beside it.
    const store = fs.realpathSync(path.join(root, "node_modules/consumer-c"));
    const viaLinks = path.join(path.dirname(store), "esm-lib/lib/cid.js");
    expect(fs.realpathSync(viaLinks)).toBe(esmStore);
    expect(registry.lookup(esmStore, "esm-lib/cid")).toBe(entry);
  });

  it("does not reach a file the copy does not give that subpath", () => {
    rootMock("esm-lib/cid");
    expect(registry.lookup(otherIndex, "other")).toBeUndefined();
  });

  // Jest keys an explicit jest.mock by the file it resolves to.
  it("leaves a jest.mock factory to the file it resolves to", () => {
    registry.register(appFile, "esm-lib/cid", () => ({}));
    expect(registry.lookup(esmNestedImport, "esm-lib/cid")).toBeUndefined();
  });

  // The ESM mock facade requires the copy's file by absolute path, from that file.
  it("lets a require of a copy's file by absolute path reach the registry", () => {
    rootMock("esm-lib/cid");
    expect(registry.mayIntercept(esmNestedImport, from(esmNestedImport))).toBe(true);
    expect(registry.mayIntercept(esmStore, from(esmStore))).toBe(true);
    expect(registry.mayIntercept(otherIndex, from(otherIndex))).toBe(false);
  });
});
