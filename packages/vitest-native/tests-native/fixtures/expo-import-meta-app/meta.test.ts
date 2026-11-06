import { createRequire } from "node:module";
import { expect, test } from "vitest";

const registry = (globalThis as { __ExpoImportMetaRegistry?: { url: unknown } })
  .__ExpoImportMetaRegistry;

test("Expo's runtime has installed the registry before any test runs", () => {
  expect(registry).toBeTypeOf("object");
});

test("a file Node loads gets `import.meta.url` from Expo's registry", () => {
  const meta = createRequire(import.meta.url)("./src/node-meta.ts");
  expect(meta.url).toBe(registry!.url);
});
