// A module with top-level await cannot be evaluated for a synchronous require: the
// require fails by name, and leaves nothing behind that breaks a later import.
import { expect, test } from "vitest";
import { requireTlaParent } from "@m/feature";

test("top-level await fails by name, and a later import still works", async () => {
  expect(() => requireTlaParent()).toThrow(
    expect.objectContaining({ code: "REQUIRE_OF_ASYNC_VITE_MODULE" }),
  );
  expect((await import("@m/validator/tlaparent")).v).toBe(2);
});
