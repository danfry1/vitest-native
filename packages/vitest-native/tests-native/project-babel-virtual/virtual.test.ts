// #666: ids spelled as files under the project root that only a plugin serves. projectBabel
// (and loadProjectJsx) ran ahead of that plugin and read them from disk: ENOENT.
import { expect, it } from "vitest";
import { count } from "resident-singleton";
import Subscription from "./src/Model.js";
import { decorated } from "virtual:decorated";
import { view } from "virtual:view";

it("a root manual mock applies through jest-compat's virtual setup module", () => {
  expect(count()).toBe(-1);
});

it("a virtual .ts module under the root is served by its plugin and compiles", () => {
  expect(decorated).toBe("served by the plugin");
});

it("a virtual .js module under the root is served by its plugin", () => {
  expect(view).toEqual({ type: "Text", children: "virtual" });
});

it("projectBabel still compiles the real decorator file", () => {
  const sub = new Subscription();
  sub.name = "general";
  expect((sub as unknown as { _raw: Record<string, string> })._raw.name).toBe("general");
});
