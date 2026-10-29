/**
 * The order the sharing does not cover yet. Node's `require` is handed Vite's instance
 * only when Vite has already evaluated the file. Required first, a project file is loaded
 * by Node, and a later import evaluates it again in Vite: two instances. This pins that
 * behaviour so the change that gives every project file one owner, whichever loader is
 * asked first, turns it from `not.toBe` to `toBe` on purpose.
 */
import { expect, it } from "vitest";

it("a project file required before it is imported is still two instances", async () => {
  const required = require("./fixtures/order-store") as { state: { value: string | null } };
  required.state.value = "written through require";
  const imported = await import("./fixtures/order-store");
  expect(imported.state).not.toBe(required.state);
  expect(imported.state.value).toBeNull();
});
