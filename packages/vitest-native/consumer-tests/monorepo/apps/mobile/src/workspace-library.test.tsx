/**
 * The topology that blocked a real migration: a workspace library with a compiled
 * build beside its source, holding module-level state, consumed by an app.
 *
 * The library publishes `main` (CJS) and `module` (ESM), which is what an ordinary
 * dual-format build produces — and the shape the report described, reaching
 * `dist/index.mjs` through main/exports. Vite prefers `module`, Node reads `main`.
 * If the two module systems disagree about which file this package IS, the app
 * configures one copy and renders the other, and nothing throws: the label simply
 * comes out empty, which is how 44 tests failed comparing empty strings against
 * expected text.
 *
 * Nothing here is exotic: no jest-compat, no shim, no manual externalization. Just a
 * workspace package built the ordinary way.
 */
import { createRequire } from "node:module";
import { render, screen } from "@testing-library/react-native";
import { expect, test } from "vitest";
import { Label, configureTranslator, translate } from "@consumer/ui";

const require = createRequire(import.meta.url);

test("a workspace library is ONE module across both module systems", async () => {
  configureTranslator((key: string) => `translated:${key}`);

  // Read back through Node's resolver, which is the other graph.
  const viaNode = require("@consumer/ui");
  expect(viaNode.translate("greeting")).toBe("translated:greeting");
  expect(translate("greeting")).toBe("translated:greeting");
});

test("a component from that library renders configured text, not an empty string", async () => {
  configureTranslator((key: string) => `Asset category: ${key}`);
  await render(<Label id="cash" />);
  expect(screen.getByTestId("label")).toHaveTextContent("Asset category: cash");
});
