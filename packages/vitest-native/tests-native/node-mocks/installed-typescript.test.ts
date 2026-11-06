/**
 * With nodeMocks on, an installed package's TypeScript source has one owner, Node (#544).
 * Vitest inlines a file Node cannot run as published, so Vite evaluated the TypeScript a
 * test imported while Node compiled its own copy for a `require` of it: two instances,
 * which the ownership guard reported as SOURCE_EVALUATED_TWICE. Node now compiles it for
 * both and Vite leaves it external, and a vi.mock still reaches its imports through Node.
 * (Default flags: tests-native/installed-typescript-mocks.test.ts.)
 */
import { expect, it, vi } from "vitest";
import { read } from "vn-installed-ts-consumer";

vi.mock("dispatch-target-lib", () => ({ source: "mocked" }));

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

it("lets a vi.mock reach an installed TypeScript package's own import, through Node", () => {
  expect(read()).toBe("mocked");
});
