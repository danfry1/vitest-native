/**
 * An installed package's TypeScript source has one owner, Node (#544). Vitest inlines a
 * file Node cannot run as published, so Vite used to evaluate the TypeScript a test
 * imported while Node compiled its own copy for a `require` of it: two instances, whose
 * module state the ownership guard reported as SOURCE_EVALUATED_TWICE. Node now compiles
 * it for both, and Vite leaves it external.
 */
import { expect, it } from "vitest";

declare const require: (id: string) => Record<string, unknown>;

it("gives a require and an import of an installed TypeScript file one instance", async () => {
  const viaNode = require("react-native-reanimated/src/common/style/propsBuilder");
  const viaVite = await import("react-native-reanimated/src/common/style/propsBuilder");
  expect(viaVite.stylePropsBuilder).toBe(viaNode.stylePropsBuilder);
});

it("compiles an installed package's TypeScript for Node, enums included, as one instance", async () => {
  const viaNode = require("vn-installed-ts-lib") as {
    store: { value: string | null; mode: string };
  };
  viaNode.store.value = "written through Node";
  const viaVite = (await import("vn-installed-ts-lib")) as unknown as typeof viaNode;
  expect(viaVite.store).toBe(viaNode.store);
  expect(viaVite.store.mode).toBe("plain");
});
